// Renders the text parts the syntax adapters and uk.js use: plain strings,
// { b } for bold and { code } for inline code. `boldStyle` colours bold
// parts, except those marked { inherit: true } (round 1 left them uncoloured).

/** @param {{ parts: Array<string | { b?: string, code?: string }>, codeStyle?: object, boldStyle?: object }} props */
export default function Rich({ parts, codeStyle, boldStyle }) {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part;
    if (part.code !== undefined) return <code key={i} style={codeStyle}>{part.code}</code>;
    return <b key={i} style={part.inherit ? undefined : boldStyle}>{part.b}</b>;
  });
}

/** The same parts as plain text (for the screen reader status). */
export function plain(parts) {
  return parts.map(part => (typeof part === 'string' ? part : part.code ?? part.b)).join('');
}
