// «Перевірка мережі»'s task seeds, as DHCP's: a first seed below 100 000, and
// the successor «Новий раунд» and «Далі →» move to, wrapping inside the URL's
// range (screens/url.js), so every task the screens make can be written into
// the address and read back.

/** A first seed (0–99 999). */
export const newSeed = (random = Math.random) => Math.floor(random() * 100000);
export const MAX_SEED = 999999;
/** The next seed, wrapping after MAX_SEED. */
export const nextSeed = value => (value + 1) % (MAX_SEED + 1);
