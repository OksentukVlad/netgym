// Section ids the IP screens link to (spec C5, S7). Targets give the sections
// these ids; a link renders only when the shell's NavContext has the section.
export const SECTION = Object.freeze({
  calculator: 'ip-calculator',
  mask: 'ip-mask',
  binary: 'ip-binary',
});

/** A fresh seed for a generated task («Ще одна», «Потренуватися → Маска»). */
export const newSeed = () => Math.floor(Math.random() * 10000);
