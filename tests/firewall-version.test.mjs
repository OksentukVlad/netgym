import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/mini-dom.mjs';

// Mount the existing screen to check the instance-key boundary and both kinds
// of DoneMark. Screen rendering and its new R5 controls belong to Opus.
test('R5 mounted version regression: old answers, drafts, reveals and marks are ignored at both levels', async () => {
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const { document } = installDom({ reducedMotion: true });
  try {
    const { act, mountFirewall, fw, combined } = await import('../.test-bundles/harness/mounted-firewall.mjs');
    for (const level of [1, 2]) {
      const m = mountFirewall();
      try {
        const variantId = level === 1 ? 'chain' : 'basic', seed = 1;
        act(() => m.store.dispatch({ type: 'place', scope: 'firewall', patch: { level, variantId: 'basic', seeds: { chain: seed, basic: seed } } }));
        const task = fw.create(combined, { level, variantId, seed });
        const oldTask = { ...task, identity: { ...task.identity, generatorVersion: 3 } };
        oldTask.instanceKey = JSON.stringify(oldTask.identity);
        const answer = fw.solution(oldTask), result = fw.check(oldTask, answer);
        const oldCommit = { instanceKey: oldTask.instanceKey, answer, result };
        const dispatch = action => act(() => m.store.dispatch({ type: 'instance', key: oldTask.instanceKey, action }));
        dispatch({ type: 'checked', answer, result });
        dispatch({ type: 'view', patch: { position: 1, drafts: answer, commit: oldCommit, revealed: [task.cards[0].id], played: task.cards.map(c => c.id) } });
        dispatch({ type: 'session', action: { type: 'reveal' } });
        m.remount();
        assert.equal(m.probe.key, task.instanceKey);
        assert.notEqual(m.probe.key, oldTask.instanceKey);
        assert.equal(m.probe.solution, null);
        assert.ok(!m.store.state.instances[task.instanceKey]?.answer);
        assert.ok(!m.store.state.instances[task.instanceKey]?.view?.drafts);
        assert.ok(!m.store.state.instances[task.instanceKey]?.view?.commit);
        assert.doesNotMatch(m.container.textContent, /розв’язано/);
        assert.equal(document.querySelectorAll('.ng-fw-work [aria-readonly="true"]').length, 0);
        assert.equal(document.querySelectorAll('.ng-fw-work [role="radio"][aria-checked="true"]').length, 0);
        // Positive control: a newly earned round still shows a mark.
        act(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'checked', answer: fw.solution(task), result: fw.check(task, fw.solution(task)) } }));
        assert.match(m.container.textContent, /розв’язано/);
      } finally { m.unmount(); }
    }
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
