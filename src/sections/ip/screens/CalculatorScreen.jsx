// «IP-калькулятор» (design §2, spec S2/S3): a tool, not an exercise, so no
// check, hints or reveal. The address and the mask are typed on the work
// side (first in one column and in the focus order; the stage stays on the
// left in two); the result on the stage updates with every valid change. While a
// field is invalid, the stage keeps the last valid result and says so.
//
// Everything it shows comes from logic/calc.js `describe` (/0–/32):
//   - /1–/30: the network, mask, broadcast, device range and count (always
//     labelled as conventional subnet arithmetic), and for ordinary unicast
//     blocks from /8 an example gateway (first or last address, first
//     preselected) with its caption;
//   - /0: the default-route line instead of a count;
//   - /31: the pair of addresses for a point-to-point link; /32: one address;
//   - the ruler (any octet), «У бітах» (BitRows, closed by default) and
//     command examples in both syntaxes (only where calc.js allows them).
// Inside the NetGym shell it links to the mask exercise with a fresh task,
// and the exercises open it with their numbers (route params { ip, prefix }).
//
// Round 4 (spec R3): the inputs come first (on the left in two columns,
// Calculator.css), the result after them; «Потренуватися → Маска» is right
// under the inputs; «Приклад конфігурації» is folded by default, and its copy
// buttons are off, with the reason in words, while an input is empty or
// malformed (the result shown is the last valid one). The count says what it
// counts: «254 вузли (без адреси мережі та широкомовної)».
import { useId } from 'react';
import { choosePrefixes, defaultAddress, describe } from '../logic/calc.js';
import { parseIp, parsePrefix } from '../../../engine/ip.js';
import { renderAddress as ciscoAddress } from '../../../engine/vendors/cisco.js';
import { renderAddress as routerosAddress } from '../../../engine/vendors/routeros.js';
import { usePlace, usePref } from '../../../ui/useStore.js';
import { useNav, useRouteParams } from '../../../ui/useNav.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import AddressField from '../../../ui/components/AddressField.jsx';
import Button from '../../../ui/components/Button.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import AddressRuler, { rulerFor } from './AddressRuler.jsx';
import BitRows, { octetsOf } from './BitRows.jsx';
import CommandBlock from './CommandBlock.jsx';
import { copyText } from '../../../ui/clipboard.js';
import { SECTION, newSeed } from './links.js';
import { calcUi, hostWords, rowNames, t } from '../uk.js';
import './Calculator.css';

const renderers = { cisco: ciscoAddress, routeros: routerosAddress };
const START = { ip: defaultAddress.ip, prefix: `/${defaultAddress.prefix}` };

/** The place's defaults: the inputs, the last valid pair, the gateway convention, «У бітах». */
const defaults = () => ({ ...START, last: { ...START }, gateway: 'first', bits: false, commands: false });

/** The result rows for a model: [key, label, value]. */
export function rowsOf(model) {
  const p = model.prefix;
  const mask = ['mask', calcUi.mask, `${model.mask} = /${p}`];
  // /31 and /32: the block above the rows names it already.
  if (p === 32) return [mask];
  if (p === 31) return [mask, ['pair', calcUi.pair, calcUi.pairValue(model.usable)]];
  if (p === 0) return [['network', calcUi.network, model.network], mask];
  return [
    ['network', calcUi.network, model.network], mask,
    ['broadcast', calcUi.broadcast, model.broadcast],
    ['range', calcUi.range, [model.usable.first, model.usable.last]],
    ['count', calcUi.count, hostWords(model.displayCount)],
  ];
}

/** The example gateway is shown only where a command example is (an
 * ordinary unicast block from /8 to /30): no gateway for /0–/7, loopback,
 * link-local, multicast or reserved space. */
export const showsGateway = model => Boolean(model.gateways && model.commandAddress);

/** The command examples for a model: one block per syntax calc.js allows. */
export function commandsOf(model) {
  if (!model.commandAddress) return [];
  return model.commandVendors
    .map(id => ({ id, label: calcUi.vendors[id], text: renderers[id](model.commandAddress) }))
    .filter(block => block.text);
}

/** @param {{ route?: { params?: object } | null, onCopy?: (text: string) => void }} props */
export default function CalculatorScreen({ route = null, onCopy = copyText }) {
  const [place, setPlace] = usePlace('ip.calc', defaults);
  const [mode, setMode] = usePref('inputMode');
  const nav = useNav();
  const bitsId = useId();

  // «Відкрити в калькуляторі» from an exercise: its address and prefix, once.
  useRouteParams(route, params => {
    const ip = typeof params.ip === 'string' ? params.ip : null;
    const prefix = Number.isInteger(params.prefix) ? `/${params.prefix}` : null;
    if (ip && prefix && describe(ip, prefix)) setPlace({ ip, prefix, last: { ip, prefix } });
  });

  const current = describe(place.ip, place.prefix, { gateway: place.gateway });
  const model = current ?? describe(place.last.ip, place.last.prefix, { gateway: place.gateway });
  const badIp = parseIp(place.ip) === null && place.ip.trim() !== '';
  const badPrefix = parsePrefix(place.prefix) === null && place.prefix.trim() !== '';

  // Every change updates the result; the last valid pair stays for the stage.
  function edit(name, value) {
    const next = { ...place, [name]: value };
    const valid = describe(next.ip, next.prefix) !== null;
    setPlace({ [name]: value, ...(valid ? { last: { ip: next.ip, prefix: next.prefix } } : {}) });
  }

  const p = model.prefix;
  const bitRows = [
    { id: 'address', label: rowNames.address, octets: octetsOf(model.ip) },
    { id: 'mask', label: rowNames.mask, octets: octetsOf(model.mask) },
    { id: 'network', label: rowNames.network, octets: octetsOf(model.network) },
    // No broadcast row for /31 and /32 (S2), nor for /0, which is a route.
    ...(model.broadcast && p !== 0 ? [{ id: 'broadcast', label: rowNames.broadcast, octets: octetsOf(model.broadcast) }] : []),
  ];
  const gateway = showsGateway(model);
  const notes = [model.noteCode && t(model.noteCode)].filter(Boolean);

  return (
    <ExerciseLayout
      wide="stage"
      first="work"
      heading={calcUi.heading}
      stage={<>
        <section className="ng-calc-result" aria-label={calcUi.result}>
          {/* Always present, so the polite live region announces the label when it appears. */}
          <p className="ng-calc-stale" aria-live="polite">{current ? '' : calcUi.stale({ cidr: model.cidr })}</p>
          <p className="ng-calc-block"><span className="ng-sr-only">{p === 32 ? calcUi.single : calcUi.block}: </span>{model.block}</p>
          <dl className="ng-calc-rows">
            {rowsOf(model).map(([key, label, value]) => (
              <div key={key} className={`ng-calc-row is-${key}`}>
                <dt>{label}</dt>
                <dd>{key === 'count'
                  ? <span><span className="ng-calc-value">{value[0]}</span> <span className="ng-calc-count-what">{value[1]}</span></span>
                  : Array.isArray(value)
                    ? <><span className="ng-calc-value">{value[0]}</span> – <span className="ng-calc-value">{value[1]}</span></>
                    : <span className="ng-calc-value">{value}</span>}
                {/* Every conventional count says what it is (subnet arithmetic). */}
                {key === 'count' && model.countCode && <p className="ng-calc-note">{t(model.countCode)}</p>}</dd>
              </div>
            ))}
            {gateway && (
              <div className="ng-calc-row is-gateway">
                <dt>{calcUi.gateway}</dt>
                <dd>
                  <span className="ng-calc-value">{model.gateway}</span>
                  <Segmented label={calcUi.gatewayChoice} value={place.gateway} onChange={value => setPlace({ gateway: value })}
                    options={[{ value: 'first', label: calcUi.first }, { value: 'last', label: calcUi.last }]} className="ng-calc-gateway" />
                  <p className="ng-calc-note">{t('calc.gateway')}</p>
                </dd>
              </div>
            )}
          </dl>
          {notes.map(note => <p key={note} className="ng-calc-line">{note}</p>)}
        </section>
        <AddressRuler {...rulerFor(model.ip, p, true)} subject="input" />
        <div className="ng-calc-bits">
          <button type="button" className="ng-calc-disclosure" aria-expanded={place.bits} aria-controls={bitsId} onClick={() => setPlace({ bits: !place.bits })}>
            {calcUi.bits} <span aria-hidden="true">{place.bits ? '▴' : '▾'}</span>
          </button>
          <div id={bitsId} hidden={!place.bits}>
            {place.bits && <BitRows rows={bitRows} prefix={p} label={calcUi.bitsCaption} />}
          </div>
        </div>
      </>}
      answer={<>
        <AddressField label={calcUi.address} kind="ip" value={place.ip} onChange={value => edit('ip', value)}
          invalid={badIp} hint={badIp ? calcUi.badIp : undefined} />
        <AddressField label={calcUi.prefix} kind="prefix" value={place.prefix} onChange={value => edit('prefix', value)}
          invalid={badPrefix} hint={badPrefix ? calcUi.badPrefix : calcUi.prefixHint}
          options={choosePrefixes.map(n => ({ value: `/${n}`, label: `/${n}` }))} mode={mode} onModeChange={setMode} />
      </>}
      tools={<>
        {nav?.has(SECTION.mask) && (
          <Button onClick={() => nav.go({ section: SECTION.mask, params: { seed: newSeed() } })}>{calcUi.practise}</Button>
        )}
        <CommandBlock heading={calcUi.commands} blocks={commandsOf(model)} note={t(model.commandNoteCode, model.commandNoteParams)} onCopy={onCopy}
          open={Boolean(place.commands)} onToggle={() => setPlace({ commands: !place.commands })}
          disabled={current ? null : calcUi.copyOff({ cidr: model.cidr })} />
      </>}
    />
  );
}
