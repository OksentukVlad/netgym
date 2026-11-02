// Copying for every «Скопіювати» button (one place, so a fix reaches all of
// them). copyText is a promise: callers say «✓ Скопійовано» only when it
// resolves; when it rejects, they select the text with selectText and ask
// for Ctrl+C.

/** Writes text to the clipboard; a promise that rejects where the page may not. */
export function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return Promise.resolve(navigator.clipboard.writeText(text));
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.reject(new Error('clipboard unavailable'));
}

/** Selects an element's text, so the student can copy it with Ctrl+C. */
export function selectText(element) {
  try {
    const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (!selection || !element) return;
    selection.removeAllRanges?.();
    selection.selectAllChildren(element);
  } catch {}
}
