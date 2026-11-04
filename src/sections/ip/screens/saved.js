// The IP sections' saved state (spec save v2; app/saved.js runs these).
import mask from '../logic/mask.js';
import binary from '../logic/binary.js';
import { asides, between, bool, count, field, finite, isObject, listOf, mapOf, matches, nullable, resultOf, shape, text } from '../../../ui/saved-shape.js';

const level = between(1, 3);
const seeds = mapOf(count);
const address = shape({ ip: text, prefix: text }, ['ip', 'prefix']);

const calculator = Object.freeze({
  places: { 'ip.calc': shape({ ip: text, prefix: text, last: address, gateway: text, bits: bool, commands: bool }, ['ip', 'prefix', 'last']) },
});

const maskExercise = {
  identity: id => matches(id, { version: mask.version }) && level(id.level) && count(id.seed),
  view: shape({ choices: mapOf(bool), invalid: mapOf(bool), notice: nullable(text), submits: count, rulerPrefix: nullable(field) }),
  answer: nullable(shape({ prefix: field, network: field, broadcast: field })),
  // The verdict's words take the evidence as their params; the ruler reads `given`.
  result: nullable(resultOf({ evidence: shape({ fields: mapOf(bool), given: nullable(finite) }) }, ['code', 'evidence'])),
  drafts: shape({ text: shape({ answer: mapOf(field) }) }),
};

const maskSaved = Object.freeze({
  places: { 'ip.mask': shape({ level, seeds, ...asides }, ['level', 'seeds']) },
  exercises: { [mask.id]: maskExercise },
});

const row = listOf(listOf(text));
const binaryExercise = {
  identity: id => matches(id, { formatVersion: 1, version: binary.version, generatorVersion: binary.generatorVersion })
    && level(id.level) && count(id.seed) && text(id.ip) && count(id.prefix),
  view: shape({
    step: between(0, 3), drafts: mapOf(row), hintCounts: mapOf(count), submits: count, notice: nullable(text),
    marks: mapOf(listOf(nullable(shape({ current: nullable(field), target: nullable(field) })))),
  }),
  answer: nullable(shape({ step: count, octets: listOf(text) }, ['octets'])),
  result: nullable(resultOf({ findings: listOf(shape({ params: isObject })) }, ['code', 'findings'])),
  parts: mapOf(shape({ octets: listOf(text) }, ['octets'])),
};

const binarySaved = Object.freeze({
  places: { 'ip.binary': shape({ level, seeds, text: bool }, ['level', 'seeds']) },
  exercises: { [binary.id]: binaryExercise },
});

export { calculator as calculatorSaved, maskSaved, binarySaved };
