/** Create the spec's FNV-1a seeded mulberry32 generator. */
export function makeRng(seed) {
  let a
  if (typeof seed === 'string') {
    a = 0x811c9dc5
    for (let i = 0; i < seed.length; i++) {
      a ^= seed.charCodeAt(i)
      a = Math.imul(a, 0x01000193) >>> 0
    }
  } else {
    a = seed >>> 0
  }
  function next() {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1))
  }
  function pick(array) {
    return array[int(0, array.length - 1)]
  }
  function shuffle(array) {
    const copy = [...array]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
  return { next, int, pick, shuffle }
}
