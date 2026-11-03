// «DHCP і NAT»'s task seeds: a first seed, and the successor «Новий раунд» and
// «Ще одна» move to. Seeds and NAT level 2's round count stay in 0–999 999,
// the URL's range (screens/url.js), so every task the screens make can be
// written into the address and read back: the successor wraps to 0. The
// modulus is even, so a count's parity (Cisco's two-LAN task on odd rounds)
// still alternates across the wrap.

/** A first seed (0–99 999). */
export const newSeed = (random = Math.random) => Math.floor(random() * 100000);
export const MAX_SEED = 999999;
/** The next seed or round count, wrapping after MAX_SEED. */
export const nextSeed = value => (value + 1) % (MAX_SEED + 1);
