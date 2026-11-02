import { t, ui } from '../uk.js';

/** Render codes only: no reference route or field values cross this boundary. */
export function reasonFeedback(verdict, reasons = {}) {
  const keys = { net: 'netOk', mask: 'maskOk', dst: 'dstOk', gw: 'gwOk', dist: 'distOk' };
  const lines = Object.entries(keys).filter(([, key]) => verdict[key] === false)
    .map(([field]) => t(`routing.static.${reasons[field] ?? 'field-wrong'}`));
  return { ok: verdict.ok, parts: [ui.shared.wrong, ...lines.flatMap(line => ['\n', line])] };
}
