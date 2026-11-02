#!/usr/bin/env python3
"""Exercise the real runner in disposable worktrees, without app bundles.

Run separately: python3 tools/test-runner-checks.py. Uses real flock, timeout,
validation and shell cleanup; substitutes only the expensive app commands.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which('node')


class RunnerChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='netgym-runner-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ['tools', 'tests/helpers', 'src/targets', 'deps/.bin', 'bin']:
            (self.root / name).mkdir(parents=True)
        for name in ['tools/test.sh', 'tools/test-plan.mjs', 'tools/test-costs.json', 'tools/test-profile-merge.mjs', 'tests/helpers/mounted-results.mjs']:
            shutil.copy(ROOT / name, self.root / name)
        (self.root / 'deps/.bin/esbuild').write_text("#!/bin/sh\nprintf 'bundle\\n' >> bundle-calls\nexit 0\n")
        (self.root / 'deps/.bin/esbuild').chmod(0o755)
        for helper in ['routing', 'firewall', 'ip', 'vlan', 'vlan3', 'setup', 'shared']:
            (self.root / f'tests/helpers/mounted-{helper}.mjs').touch()
        for i in range(3):
            (self.root / f'tests/fixture-{i}.test.mjs').touch()
        shim = self.root / 'bin/node'
        shim.write_text('''#!/usr/bin/env python3
import json, os, pathlib, signal, sys, time
args = sys.argv[1:]
if args[0] == '--import': args = args[2:]
root = pathlib.Path.cwd()
with (root/'calls.jsonl').open('a') as f:
    f.write(json.dumps(dict(args=args, mode=os.environ.get('NETGYM_TEST_MODE'))) + '\\n')
if args[0] == 'tests/helpers/mounted-results.mjs' and os.environ.get('SLOW_VALIDATOR') == '1': time.sleep(.5)
if args[0] in ['tests/helpers/mounted-results.mjs', 'tools/test-plan.mjs', 'tools/test-profile-merge.mjs']:
    os.execv(os.environ['REAL_NODE'], [os.environ['REAL_NODE'], *args])
if args[0].startswith('tests/helpers/mounted-'):
    name = pathlib.Path(args[0]).stem.removeprefix('mounted-')
    (root/(name+'.pid')).write_text(str(os.getpid()))
    fault_helper = os.environ.get('FAULT_HELPER')
    if (os.environ.get('HOLD') == '1' and name != fault_helper) or name == os.environ.get('HOLD_HELPER'):
        time.sleep(30)
    fault = os.environ.get('FAULT') if name == os.environ.get('FAULT_HELPER') else ''
    if fault: time.sleep(.2)  # Let every sibling start before a later failure.
    if fault == 'exit': sys.exit(23)
    if fault == 'timeout': time.sleep(30)
    if fault == 'malformed': print('not JSON'); sys.exit(0)
    if fault == 'truncated': print('{"results":['); sys.exit(0)
    counts = dict(routing=453, firewall=343, ip=179, vlan=288, vlan3=158, setup=480, shared=118)
    results = [dict(name=f'{name}-{i}', ok=True) for i in range(counts[name])]
    if fault == 'false': results[-1]['ok'] = False
    if fault == 'short': results.pop()
    print(json.dumps(dict(results=results)))
    sys.exit(0)
if args[0] == '--test':
    if os.environ.get('IGNORE_TERM') == '1': signal.signal(signal.SIGTERM, signal.SIG_IGN)
    (root/f'node-test-{os.getpid()}.pid').write_text(str(os.getpid()))
    if os.environ.get('HOLD_TEST') == '1':
        if os.environ.get('FAULT_TEST') == '1' and 'tests/fixture-2.test.mjs' in args:
            time.sleep(.2); sys.exit(45)
        time.sleep(30)
    sys.exit(int(os.environ.get('TEST_EXIT', '0')))
if args[0] == 'tools/step9-sweep.mjs': sys.exit(int(os.environ.get('SWEEP_EXIT', '0')))
if args[0] == 'tools/vlan-sweep.mjs': print('{}'); sys.exit(int(os.environ.get('VLAN_EXIT', '0')))
sys.exit(99)
''')
        shim.chmod(0o755)
        # Exercise a real expiry without waiting 240 seconds in each fault case.
        timeout_shim = self.root / 'bin/timeout'
        # Strip only the runner's fixed timeout arguments before forwarding.
        timeout_shim.write_text('#!/bin/sh\nif [ "${FAULT:-}" = timeout ]; then\n  shift 2\n  exec /usr/bin/timeout --kill-after=.2 .15 "$@"\nfi\nexec /usr/bin/timeout "$@"\n')
        timeout_shim.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root / 'bin') + ':' + os.environ['PATH'],
                        REAL_NODE=NODE, NETGYM_TEST_NODE_MODULES=str(self.root / 'deps'))

    def run_runner(self, *args, **env):
        return subprocess.run(['bash', 'tools/test.sh', *args], cwd=self.root,
                              env=dict(self.env, **env), capture_output=True, text=True, timeout=15)

    def calls(self):
        return [json.loads(line) for line in (self.root / 'calls.jsonl').read_text().splitlines()]

    def assert_reaped(self):
        for file in self.root.glob('*.pid'):
            pid = int(file.read_text())
            self.assertFalse(Path(f'/proc/{pid}').exists(), f'helper not reaped: {pid}')

    def test_modes_and_unknown_options(self):
        for args, mode in [((), 'fast'), (('--full',), 'full')]:
            result = self.run_runner(*args, NETGYM_TEST_MODE='wrong', NETGYM_TEST_SEEDS='bad')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(self.calls()[-1]['mode'], mode)
        calls = self.calls()
        self.assertTrue(any(c['args'] == ['tools/vlan-sweep.mjs', '200'] for c in calls))
        self.assertTrue(any(c['args'][0] == 'tools/step9-sweep.mjs' for c in calls))
        for args in [('--bad',), ('--full', '--bad'), ('--full', '--full')]:
            self.assertEqual(self.run_runner(*args).returncode, 2)
        self.assertEqual(self.calls(), calls, 'invalid options must not start work')

    def test_every_helper_failure_and_cleanup(self):
        for helper in ['routing', 'firewall', 'ip', 'vlan', 'vlan3', 'setup', 'shared']:
            for fault in ['exit', 'timeout', 'malformed', 'truncated', 'false', 'short']:
                with self.subTest(helper=helper, fault=fault):
                    start = time.monotonic()
                    result = self.run_runner(FAULT_HELPER=helper, FAULT=fault, HOLD='0' if fault == 'timeout' else '1')
                    self.assertNotEqual(result.returncode, 0, result.stderr)
                    self.assertLess(time.monotonic() - start, 3, 'failure waited for a held sibling')
                    self.assertIn('mounted-' + helper, result.stderr)
                    self.assert_reaped()
        self.assertFalse(any(c['args'][0] == '--test' for c in self.calls()))

    def test_failure_finishing_during_validation(self):
        start = time.monotonic()
        result = self.run_runner(FAULT_HELPER='ip', FAULT='exit', HOLD_HELPER='firewall', SLOW_VALIDATOR='1')
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertIn('mounted-ip failed', result.stderr)
        self.assertLess(time.monotonic() - start, 3)
        self.assert_reaped()

    def test_assertion_and_sweep_failures(self):
        self.assertEqual(self.run_runner(TEST_EXIT='42').returncode, 42)
        self.assertEqual(self.run_runner('--full', SWEEP_EXIT='43').returncode, 43)
        self.assertEqual(self.run_runner('--full', VLAN_EXIT='44').returncode, 44)

    def test_shard_cleanup_and_cap(self):
        start = time.monotonic()
        result = self.run_runner(HOLD_TEST='1', FAULT_TEST='1')
        self.assertEqual(result.returncode, 45, result.stderr)
        self.assertIn('Node test shard 2 failed', result.stderr)
        self.assertLess(time.monotonic() - start, 3, 'later shard waited for earlier held shards')
        self.assertEqual(len(list(self.root.glob('node-test-*.pid'))), 3)
        self.assert_reaped()
        for jobs in ['0', '4', 'bad']:
            self.assertEqual(self.run_runner(NETGYM_TEST_JOBS=jobs).returncode, 2)
        for jobs in ['1', '2', '3']:
            before = len(self.calls())
            self.assertEqual(self.run_runner(NETGYM_TEST_JOBS=jobs).returncode, 0)
            calls = [c for c in self.calls()[before:] if c['args'][0] == '--test']
            self.assertEqual(len(calls), int(jobs))
            files = [a for c in calls for a in c['args'] if a.endswith('.test.mjs')]
            self.assertEqual(sorted(files), [f'tests/fixture-{i}.test.mjs' for i in range(3)])

    def test_shard_kill_escalation(self):
        start = time.monotonic()
        result = self.run_runner(HOLD_TEST='1', FAULT_TEST='1', IGNORE_TERM='1')
        elapsed = time.monotonic() - start
        self.assertEqual(result.returncode, 45, result.stderr)
        self.assertIn('Node test shard 2 failed', result.stderr)
        self.assertGreaterEqual(elapsed, 5)
        self.assertLess(elapsed, 9, 'TERM-resistant shards were not killed promptly')
        self.assertEqual(len(list(self.root.glob('node-test-*.pid'))), 3)
        self.assert_reaped()

    def test_unregistered_mounted_helper(self):
        (self.root / 'tests/helpers/mounted-new.mjs').touch()
        result = self.run_runner()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Unregistered mounted helper: tests/helpers/mounted-new.mjs', result.stderr)
        self.assertFalse((self.root / 'bundle-calls').exists())
        self.assertFalse((self.root / 'calls.jsonl').exists())

    def test_lock_and_interruption(self):
        for signum, code in [(signal.SIGTERM, 143), (signal.SIGINT, 130), (signal.SIGHUP, 129)]:
            with self.subTest(signal=signum):
                self.interrupt_runner(signum, code)

    def interrupt_runner(self, signum, code):
        for file in self.root.glob('*.pid'):
            file.unlink()
        p = subprocess.Popen(['bash', 'tools/test.sh'], cwd=self.root,
                             env=dict(self.env, HOLD='1'), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while len(list(self.root.glob('*.pid'))) < 7 and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertEqual(len(list(self.root.glob('*.pid'))), 7)  # one per registered mounted helper
            before = self.calls()
            bundles = (self.root / 'bundle-calls').read_text()
            blocked = self.run_runner()
            self.assertEqual(blocked.returncode, 75, blocked.stderr)
            self.assertEqual(self.calls(), before)
            self.assertEqual((self.root / 'bundle-calls').read_text(), bundles, 'lock must cover bundling')
            p.send_signal(signum)
            p.communicate(timeout=10)
            self.assertEqual(p.returncode, code)
            self.assert_reaped()
            self.assertEqual(self.run_runner().returncode, 0, 'lock must release after interruption')
        finally:
            if p.poll() is None:
                p.terminate()
                p.communicate(timeout=10)


if __name__ == '__main__':
    unittest.main(verbosity=2)
