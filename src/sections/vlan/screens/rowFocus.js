// After a row's «✕» (VLAN-2 fix brief item 3): focus stays in its list. The
// row now in the removed one's place takes it (its own «✕»), else the row
// before, else the list's add button once the list is empty; never the page.
// Shared by every removable list of the VLAN forms (PortsForm's bridge VLAN
// rows, RouteForm's subinterfaces, VLAN interfaces and addresses).
import { useEffect, useRef } from 'react';

/** Ids for a list's «✕» buttons and its add button, so focus can find them after a render. */
export const removeId = (device, list, index) => `vl-${device}-${list}-${index}-remove`;
export const addId = (device, list) => `vl-${device}-${list}-add`;

/** @returns {(device: string, list: string, index: number) => void} call it as a row is removed */
export function useRowFocus() {
  const pending = useRef(null);
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const byId = id => (typeof document === 'undefined' ? null : document.getElementById(id));
    (byId(removeId(p.device, p.list, p.index)) ?? (p.index > 0 ? byId(removeId(p.device, p.list, p.index - 1)) : null) ?? byId(addId(p.device, p.list)))?.focus();
  });
  return (device, list, index) => { pending.current = { device, list, index }; };
}
