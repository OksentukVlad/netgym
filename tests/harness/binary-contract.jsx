// Logic/store contract only; the production BinaryScreen belongs to Opus.
import { useExercise } from '../../src/ui/useExercise.js';
import binary from '../../src/sections/ip/logic/binary.js';
export { testStore } from './contract.jsx';
export { binary };
export function BinaryProbe({ params, expose }) {
  expose(useExercise(binary, null, params));
  return null;
}
