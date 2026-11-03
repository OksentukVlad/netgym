// E2 «DHCP-сервер» (spec v1 E2 with v2, v2.1; logic/server.js): what the
// router's DHCP server gives out. Three levels:
//   - 1: a /24 with the router at .1; 2: a /25–/27, the router not at .1, a
//     device in the middle (one range on the bigger side always fits). Both
//     neutral, for either vendor: step 1 is «від» and «до» only; once its
//     check passes the range locks and step 2 asks «Шлюз для ПК» and «DNS
//     для ПК» (the action line changes in place), with «DNS провайдера: …»;
//   - 3, the vendor's own form: Cisco's `ip dhcp excluded-address` rows
//     (from–to, each rendering its command beside it, «+ ще один рядок» up to
//     three; a blank «до» is one address), then step 2 as above with the IOS
//     words; MikroTik's DHCP Setup wizard in its order (interface, address
//     space, gateway, addresses to give out, DNS, lease), one form, one check.
// The strip (the shared AddressRuler over the network) has a pin for the
// router and each device, the network and broadcast at its ends, the range
// as a band once both ends parse (before that a marker at «від»), and its
// text equivalent under it (logic stripView/stripCaption). Cisco's pool is
// drawn live, the router's pin dashed (excluded automatically). A finding
// that names a device, the router or an end marks that pin.
//
// After a pass: three ✓ rows of what the PC got (from the answer: logic
// clientCheck) and the resulting native lines, read-only with «Скопіювати»
// (logic nativeLines). «Як ПК отримує адресу» (DORA) is a folded aside in
// the task, so only the worked example's row stands above the first field.
// «Показати відповідь» fills the form with logic's referenceAnswer (read
// only then). «Далі →» gives another network (renumbered: «Інші адреси»).
import { useMemo } from 'react';
import { prefixToMask } from '../../../engine/ip.js';
import * as server from '../logic/server.js';
import { serverExample } from '../logic/examples.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, useStore } from '../../../ui/useStore.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import AddressField from '../../../ui/components/AddressField.jsx';
import AddressRuler from '../../../ui/components/AddressRuler.jsx';
import Aside from '../../../ui/components/Aside.jsx';
import CopyBlock from '../../../ui/components/CopyBlock.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import { uk } from '../../../ui/uk.js';
import { actions, dora, labels, modes, screen } from '../uk.js';
import TextField from './TextField.jsx';
import { nextSeed } from './seeds.js';

/** The aside's store place (folded at first: spec v1 E2 «folded»). */
export const ASIDES = 'dhcp.server';

/** The exercise for useExercise (logic/server.js; the reference only on reveal). */
export const serverExercise = {
  id: server.id, version: server.version,
  create: (_, { seed, level, vendor, other }) => server.generateScenario({ seed, level, vendor, otherAddresses: other }),
  check: (task, answer) => server.check(task, answer),
  solution: task => server.referenceAnswer(task),
};

const lastOctet = ip => Number(String(ip).split('.')[3]);
const sameNet = (ip, network) => typeof ip === 'string' && ip.split('.').slice(0, 3).join('.') === network.split('.').slice(0, 3).join('.');
const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
const BLANK = { from: '', to: '' };

/** The form's shape: neutral (levels 1–2), Cisco's exclusions or MikroTik's wizard (level 3). */
export const formOf = task => (task.level < 3 ? 'neutral' : task.vendor === 'cisco' ? 'cisco' : 'wizard');

/** The logic's answer from the form's draft. */
export function answerOf(task, draft = {}) {
  const options = { gateway: draft.gateway ?? '', dns: draft.dns ?? '' };
  const form = formOf(task);
  if (form === 'cisco') return { exclusions: draft.rows ?? [BLANK], ...options };
  if (form === 'wizard') return { ranges: draft.ranges ?? '', ...options };
  return { ranges: [{ from: draft.from ?? '', to: draft.to ?? '' }], ...options };
}

/** The form's draft from a (reference) answer: what «Показати відповідь» fills in. */
export function draftOf(task, answer) {
  const dns = answer.dns.join(' ');
  const form = formOf(task);
  if (form === 'cisco') return { rows: answer.exclusions.map(r => ({ from: r.from, to: r.to === r.from ? '' : r.to })), gateway: answer.gateway, dns };
  if (form === 'wizard') return { ranges: answer.ranges.map(r => `${r.from}-${r.to}`).join(','), gateway: answer.gateway, dns };
  return { from: answer.ranges[0].from, to: answer.ranges[0].to, gateway: answer.gateway, dns };
}

/** The strip's props (the shared AddressRuler) from logic's stripView. `marked`: the address a finding names. */
export function stripProps(task, answer, marked = null) {
  const v = server.stripView(task, answer);
  const span = { start: lastOctet(v.network), end: lastOctet(v.broadcast) };
  const inside = r => sameNet(r.from, v.network) && sameNet(r.to, v.network);
  const bands = v.ranges.filter(inside).map(r => ({ start: Math.max(span.start, lastOctet(r.from)), end: Math.min(span.end, lastOctet(r.to)) })).filter(b => b.start <= b.end);
  const pin = (address, name, extra = {}) => ({ value: lastOctet(address), label: `${name} .${lastOctet(address)}`, short: `.${lastOctet(address)}`, marked: address === marked, ...extra });
  const markerOk = !bands.length && v.marker && sameNet(v.marker, v.network) && lastOctet(v.marker) >= span.start && lastOctet(v.marker) <= span.end;
  return {
    octet: 4, unit: (span.end - span.start + 1) / 16, span, bands,
    value: markerOk ? lastOctet(v.marker) : null,
    pins: [pin(v.router, labels.router, { auto: v.routerAutoExcluded }), ...v.statics.map(s => pin(s.address, s.name))],
    caption: v.routerAutoExcluded ? `${v.caption}. ${capital(labels.automaticExclusion)}.` : v.caption,
  };
}

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function ServerView({ vendor, place, setPlace }) {
  const { state } = useStore();
  // «Як ПК отримує адресу» starts folded (Aside reads its choice from this place).
  usePlace(ASIDES, () => ({ asides: { dora: false } }));
  const level = place.server.level;
  const { seed, other } = place.server.tasks[level];
  const ex = useExercise(serverExercise, null, { seed, level, vendor, other });
  const { task, view, session } = ex;
  const form = formOf(task);
  const base = task.network.split('.').slice(0, 3).join('.');
  const draft = view.draft ?? {};
  const answer = answerOf(task, draft);
  const revealed = session.revealed;
  // Step 1 (the range) passed: its fields lock and step 2 opens. The wizard is one step.
  const step = form === 'wizard' ? 'all' : view.step ?? 'range';
  const passed = useMemo(() => (revealed || view.passed ? server.check(task, answer) : null), [task, revealed, view.passed, JSON.stringify(answer)]);
  const finished = Boolean(passed?.ok);
  const result = view.result ?? null;
  const checkedKey = JSON.stringify(answer);
  // An edit after a failing check leaves its verdict «до змін» (a passed range is locked).
  const stale = Boolean(result) && !result.ok && !finished && view.checkedKey !== checkedKey;
  const example = useMemo(() => serverExample({ level, vendor }), [level, vendor]);
  const earned = earnedBy(state.instances, id => (id.exerciseId === server.id ? id.level : null));
  const marked = result && !result.ok && !stale ? result.address ?? null : null;
  // The strip draws Cisco's pool live: a wholly blank row is left out of the drawing (the check still asks for it).
  const drawn = form === 'cisco' ? { ...answer, exclusions: answer.exclusions.filter(r => `${r.from}${r.to}`.trim()) } : answer;
  const strip = stripProps(task, drawn, marked);

  // What the current verdict is about (data-evidence): the range part for step 1's check, step 2's fields
  // after it; in the wizard the row a finding names (the range for an allocation finding).
  // A passing step 1 opens step 2: its fields are what comes next, so they are the evidence then.
  const about = result && !stale && !revealed ? (result.final ? (form === 'wizard' ? (result.ok ? 'ranges' : result.field ?? 'ranges') : 'options') : result.ok ? 'options' : 'range') : null;
  const ev = on => (on ? { 'data-evidence': 'current' } : {});
  const edit = patch => { if (!finished && !revealed) ex.setView({ draft: { ...draft, ...patch } }); };
  function onCheck() {
    if (finished || revealed) return;
    const checks = (view.checks ?? 0) + 1;
    if (step === 'range') {
      const r = server.check(task, answer, { step: 'allocation' });
      ex.check(answer, { result: { ...r, complete: false } });
      ex.setView({ checks, result: { ...r, final: false }, checkedKey, ...(r.ok ? { step: 'options' } : {}) });
      return;
    }
    const r = server.check(task, answer);
    ex.check(answer, { result: { ...r, complete: r.ok } });
    ex.setView({ checks, result: { ...r, final: true }, checkedKey, passed: r.ok });
  }
  function onReveal() {
    const shown = draftOf(task, ex.solution ?? server.referenceAnswer(task));
    ex.reveal();
    ex.setView({ draft: shown, step: form === 'wizard' ? undefined : 'options' });
  }
  const another = () => setPlace({ server: { ...place.server, tasks: { ...place.server.tasks, [level]: { seed: nextSeed(seed), other: true } } } });
  const chooseLevel = next => setPlace({ server: { ...place.server, level: next } });

  const tone = r => (r.ok ? 'ok' : r.kind === 'info' ? 'info' : 'no');
  const verdict = result && !revealed ? {
    tone: tone(result), scope: result.ok && result.final ? 'task' : 'part', stamp: view.checks ?? 0,
    summary: result.text,
  } : null;

  const locked = step !== 'range' || finished || revealed;
  const done = finished || revealed;
  const optionsShown = form === 'wizard' || step === 'options';
  const optionFields = (cisco = false) => <>
    <AddressField label={cisco ? `${labels.gateway} (${screen.gatewayTerm})` : labels.gateway} value={draft.gateway ?? ''} onChange={v => edit({ gateway: v })} onEnter={onCheck}
      invalid={!stale && result?.field === 'gateway'} readOnly={done} />
    <TextField label={cisco ? `${labels.dns} (${screen.dnsTerm})` : labels.dns} hint={screen.dnsHint} value={draft.dns ?? ''} onChange={v => edit({ dns: v })} onEnter={onCheck}
      invalid={!stale && result?.field === 'dns'} readOnly={done} />
  </>;
  // The DNS facts come with the step that asks for DNS (spec v2: «DNS провайдера» with step 2; the
  // router answering DNS queries next to it, so the task above the strip stays short on a phone).
  // The wizard keeps one rhythm: there the DNS facts are the DNS field's hint.
  const wizardDnsHint = [labels.providerDns(task.providerDns), ...(task.routerForwardsDns ? [capital(labels.forwardsDns)] : []), screen.dnsHint].join(' · ');
  const providerLine = <>
    <p className="ng-dh-given-line">{labels.providerDns(task.providerDns)}</p>
    {task.routerForwardsDns && <p className="ng-dh-given-line">{capital(labels.forwardsDns)}.</p>}
  </>;

  let fields;
  if (form === 'neutral') {
    fields = <>
      {/* One hint for the pair, above it, so «від» and «до» stand level. */}
      <p className="ng-field-hint ng-dh-range-hint">{screen.rangeHint(base)}</p>
      <div className="ng-dh-range" {...ev(about === 'range')}>
        <AddressField label={labels.from} value={draft.from ?? ''} onChange={v => edit({ from: v })} onEnter={onCheck} readOnly={locked} />
        <AddressField label={labels.to} value={draft.to ?? ''} onChange={v => edit({ to: v })} onEnter={onCheck} readOnly={locked} />
      </div>
      {optionsShown && <div className="ng-dh-step2" {...ev(about === 'options')}>{providerLine}{optionFields()}</div>}
    </>;
  } else if (form === 'cisco') {
    const rows = draft.rows ?? [BLANK];
    const setRow = (i, patch) => edit({ rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    fields = <>
      <div className="ng-dh-given"><p className="ng-dh-given-title">{screen.ciscoGiven}</p>
        <pre className="ng-dh-pre">{`ip dhcp pool LAN\nnetwork ${task.network} ${prefixToMask(task.prefix)}`}</pre></div>
      <ol className="ng-dh-rows" {...ev(about === 'range')}>
        {rows.map((row, i) => (
          <li key={i} className="ng-dh-row" data-term="">
            <div className="ng-dh-row-fields">
              <AddressField label={labels.from} value={row.from} onChange={v => setRow(i, { from: v })} onEnter={onCheck} readOnly={locked} />
              <AddressField label={labels.to} value={row.to} onChange={v => setRow(i, { to: v })} onEnter={onCheck} readOnly={locked} />
              {i > 0 && !locked && <button type="button" className="ng-dh-remove" aria-label={screen.removeRow(i + 1)} title={uk.remove} onClick={() => edit({ rows: rows.filter((_, j) => j !== i) })}>×</button>}
            </div>
            <code className="ng-dh-row-command">{server.exclusionLines([row])[0] ?? 'ip dhcp excluded-address …'}</code>
          </li>
        ))}
      </ol>
      {!locked && rows.length < 3 && <button type="button" className="ng-dh-add" onClick={() => edit({ rows: [...rows, BLANK] })}>{labels.addExclusion}</button>}
      {optionsShown && <div className="ng-dh-step2" {...ev(about === 'options')}>{providerLine}{optionFields(true)}</div>}
    </>;
  } else {
    const ids = { gateway: 'gateway', ranges: 'ranges', dns: 'dns' };
    fields = <>
      <div className="ng-dh-wizard">
        {server.wizardFields(task).map(f => (
          <div key={f.id} className="ng-dh-wslot">
          <div className={`ng-dh-wrow${f.given ? ' is-given' : ''}`} data-term="" {...ev(about === f.id)}>
            <Purpose>{f.purpose}</Purpose>
            {f.given
              ? <p className="ng-dh-wgiven"><span className="ng-dh-wname">{f.native}</span> <code>{f.value}</code></p>
              : <TextField label={f.native} hint={f.id === 'ranges' ? screen.rangesHint(base) : f.id === 'dns' ? wizardDnsHint : undefined} mono
                  value={draft[ids[f.id]] ?? ''} onChange={v => edit({ [ids[f.id]]: v })} onEnter={onCheck}
                  invalid={!stale && result && !result.ok && (result.field === f.id || (!result.field && f.id === 'ranges'))} readOnly={done} />}
          </div>
          </div>
        ))}
      </div>
    </>;
  }

  const client = finished ? server.clientCheck(task, answer) : [];
  const native = finished ? server.nativeLines(task, answer, vendor) : [];
  const action = done ? actions.committed : form === 'wizard' ? actions.wizard : step === 'options' ? actions.options : form === 'cisco' ? actions.exclusions : actions.range;

  return (
    <ExerciseLayout
      heading={modes.server}
      controls={<SheetChoice stepper label={screen.level} value={level} onChange={chooseLevel} className="ng-dh-levels"
        options={[1, 2, 3].map(n => ({ value: n, label: <>{labels.levels[n - 1]}<DoneMark done={earned.has(n)} /></>, step: labels.levels[n - 1] }))} />}
      stage={<div className="ng-dh-intro">
        <p className="ng-dh-task">{screen.serverTask(task.network, task.prefix)} {capital(labels.clients(task.clients))}.</p>
        <Aside screen={ASIDES} id="dora" title={labels.dora}>
          <ul className="ng-dh-dora">{dora.map(line => <li key={line}>{line}</li>)}</ul>
        </Aside>
        <div className="ng-dh-strip" data-pins={strip.pins.length} {...(marked ? { 'data-marked': '' } : {})}>
          <AddressRuler {...strip} />
        </div>
        {revealed && <p className="ng-dh-shown"><span className="ng-shown-chip">{uk.help.shown}</span></p>}
      </div>}
      action={action}
      actionId="ng-dh-action"
      example={<WorkedExample taskKey={`${ex.key}`} context={example.context} head={example.columns} rows={example.rows} note={example.note} />}
      answer={<div className="ng-dh-form" data-form={form}>{fields}</div>}
      help={<HelpPanel
        taskKey={ex.key}
        stepKey={step}
        check={done ? null : { onCheck }}
        verdict={verdict}
        stale={stale}
        reveal={{ revealed, onReveal, render: () => null, applied: screen.revealApplied }}
        next={{ onNext: another }}
      />}
      tools={finished ? <>
        <section className="ng-dh-client" aria-label={screen.clientTitle}>
          <p className="ng-dh-client-title">{screen.clientTitle}</p>
          <ul className="ng-dh-client-rows">{client.map(row => <li key={row.id}><span aria-hidden="true">✓ </span>{row.text}</li>)}</ul>
        </section>
        <section className="ng-dh-native-lines" aria-label={labels.native}>
          <p className="ng-dh-client-title">{labels.native}</p>
          <CopyBlock text={native.join('\n')} what={labels.native} />
        </section>
      </> : null}
    />
  );
}
