export function* permutations(values) {
  if (!values.length) { yield []; return; }
  for (let i = 0; i < values.length; i++) {
    for (const rest of permutations(values.filter((_, j) => i !== j))) yield [values[i], ...rest];
  }
}

export function* interleavings(left, right) {
  if (!left.length) { yield [...right]; return; }
  if (!right.length) { yield [...left]; return; }
  for (const rest of interleavings(left.slice(1), right)) yield [left[0], ...rest];
  for (const rest of interleavings(left, right.slice(1))) yield [right[0], ...rest];
}
