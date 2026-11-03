// A small DOM for mounting React screens in Node (react-dom/client with
// act), for lifecycle tests that server rendering can't run: effects,
// timers, events. Test-only, and only as much DOM as the routing screen and
// React DOM 18 use:
//   - nodes: elements (HTML and SVG), text; append/insert/remove,
//     attributes, `style`, `textContent`, `contains`, `compareDocumentPosition`, `closest`,
//     `querySelector(All)` for simple selectors (tag, #id, .class,
//     [attr] and [attr="value"], chained, and the descendant combinator),
//     `outerHTML`;
//   - events: capture and bubble through the tree to `document` and
//     `window`, `preventDefault`, `stopPropagation`, `window.event`;
//   - focus: `document.activeElement`, `focus()`, `blur()`; with
//     `installDom({ focusEvents: true })` also `focusout` on the element
//     losing focus and `focusin` on the one gaining it (both bubble, as
//     React's onBlur and onFocus need). The routing scenarios opt in (OPT-1
//     UI); the others fire focus events themselves where they need them
//     (there is no `:focus-visible` here), so their focus() stays silent;
//   - `window.matchMedia` answering prefers-reduced-motion as asked.
// No layout: sizes are 0, and there is no ResizeObserver (screens that
// measure fall back to their defaults).
// installDom() puts `window` and `document` on globalThis; it must run
// before React DOM is imported (React decides at import whether it has a
// DOM). Use it in its own process: the main test process renders on the
// server and must not see a `window`.
const HTML = 'http://www.w3.org/1999/xhtml';
const ELEMENT = 1, TEXT = 3, DOCUMENT = 9;

class MiniNode {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._listeners = []; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get parentElement() { return this.parentNode?.nodeType === ELEMENT ? this.parentNode : null; }
  get nextSibling() { const list = this.parentNode?.childNodes; return list ? list[list.indexOf(this) + 1] ?? null : null; }
  get previousSibling() { const list = this.parentNode?.childNodes; return list ? list[list.indexOf(this) - 1] ?? null : null; }
  appendChild(child) { child.parentNode?.removeChild(child); this.childNodes.push(child); child.parentNode = this; return child; }
  insertBefore(child, ref) {
    if (!ref) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) { const i = this.childNodes.indexOf(child); if (i >= 0) this.childNodes.splice(i, 1); child.parentNode = null; return child; }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  /** Document order only (HelpPanel asks whether evidence lies before its board): 2 preceding, 4 following, 8/16 ancestor/descendant. */
  compareDocumentPosition(other) {
    if (other === this) return 0;
    if (other.contains(this)) return 2 | 8;
    if (this.contains(other)) return 4 | 16;
    const path = n => { const out = []; for (; n; n = n.parentNode) out.unshift(n); return out; };
    const a = path(this), b = path(other);
    let i = 0;
    while (a[i] === b[i]) i++;
    if (i === 0) return 1;
    const kids = a[i - 1].childNodes;
    return kids.indexOf(b[i]) > kids.indexOf(a[i]) ? 4 : 2;
  }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(value) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (value !== '' && value != null) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  addEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    const entry = { type, fn, capture };
    if (options?.once) entry.fn = function once(event) { this.removeEventListener(type, once, options); return fn.call(this, event); };
    this._listeners.push(entry);
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this._listeners = this._listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
  }
}

class MiniText extends MiniNode {
  constructor(doc, data) { super(doc); this.nodeType = TEXT; this.nodeName = '#text'; this.data = String(data); }
  get nodeValue() { return this.data; }
  set nodeValue(value) { this.data = String(value); }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
  get outerHTML() { return this.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}

function makeStyle() {
  const style = {};
  Object.defineProperty(style, 'setProperty', { value: (name, value) => { style[name] = value; } });
  Object.defineProperty(style, 'removeProperty', { value: name => { delete style[name]; } });
  return style;
}

/** One compound selector (tag, #id, .class, [attr], [attr="value"]) → a test. */
function compile(selector) {
  const parts = selector.trim().match(/^[a-zA-Z][\w-]*|#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) ?? [];
  if (parts.join('') !== selector.trim()) throw new Error(`mini-dom: unsupported selector ${selector}`);
  const tests = parts.map(p => {
    if (p[0] === '#') return el => el.getAttribute('id') === p.slice(1);
    if (p[0] === '.') return el => el.className.split(/\s+/).includes(p.slice(1));
    if (p[0] === '[') {
      const [, name, value] = p.match(/^\[([^=\]]+)(?:="?([^"\]]*)"?)?\]$/);
      return el => (value === undefined ? el.hasAttribute(name) : el.getAttribute(name) === value);
    }
    return el => el.localName === p.toLowerCase();
  });
  return el => tests.every(t => t(el));
}
/** A selector list; each selector a chain of compounds joined by descendant combinators. */
const matcher = selector => {
  const alternatives = (selector.match(/(?:[^,[]+|\[[^\]]*\])+/g) ?? []).map(one => {
    const chain = (one.trim().match(/(?:[^\s[]+|\[[^\]]*\])+/g) ?? []).map(compile);
    if (!chain.length) throw new Error(`mini-dom: unsupported selector ${selector}`);
    return el => {
      if (!chain.at(-1)(el)) return false;
      let i = chain.length - 2;
      for (let n = el.parentNode; n && i >= 0; n = n.parentNode) if (n.nodeType === ELEMENT && chain[i](n)) i--;
      return i < 0;
    };
  });
  return el => alternatives.some(t => t(el));
};

class MiniElement extends MiniNode {
  constructor(doc, tag, namespace = HTML) {
    super(doc);
    this.nodeType = ELEMENT;
    this.namespaceURI = namespace;
    this.localName = namespace === HTML ? tag.toLowerCase() : tag;
    this.tagName = namespace === HTML ? tag.toUpperCase() : tag;
    this.nodeName = this.tagName;
    this._attrs = new Map();
    this.style = makeStyle();
    Object.assign(this, { scrollLeft: 0, scrollTop: 0, scrollHeight: 0, scrollWidth: 0, clientHeight: 0, clientWidth: 0, clientTop: 0, clientLeft: 0, offsetParent: null });
  }
  setAttribute(name, value) { this._attrs.set(name, String(value)); }
  setAttributeNS(ns, name, value) { this.setAttribute(name, value); }
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  hasAttribute(name) { return this._attrs.has(name); }
  removeAttribute(name) { this._attrs.delete(name); }
  removeAttributeNS(ns, name) { this.removeAttribute(name); }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value) { this.setAttribute('class', value); }
  get id() { return this.getAttribute('id') ?? ''; }
  get type() { return this.getAttribute('type') ?? (this.localName === 'input' ? 'text' : undefined); }
  get classList() { return { contains: name => this.className.split(/\s+/).includes(name) }; }
  get children() { return this.childNodes.filter(c => c.nodeType === ELEMENT); }
  focus() { this.ownerDocument.moveFocus(this); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.moveFocus(this.ownerDocument.body); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches(selector) { return matcher(selector)(this); }
  closest(selector) { const test = matcher(selector); for (let n = this; n?.nodeType === ELEMENT; n = n.parentNode) if (test(n)) return n; return null; }
  querySelectorAll(selector) {
    const test = matcher(selector), out = [];
    const walk = node => { for (const c of node.childNodes) if (c.nodeType === ELEMENT) { if (test(c)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  get outerHTML() {
    const style = Object.entries(this.style).map(([k, v]) => `${k}:${v}`).join(';');
    const attrs = [...this._attrs].map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('') + (style ? ` style="${style}"` : '');
    return `<${this.localName}${attrs}>${this.childNodes.map(c => c.outerHTML).join('')}</${this.localName}>`;
  }
}

class MiniDocument extends MiniNode {
  constructor() {
    super(null);
    this.ownerDocument = null;
    this.nodeType = DOCUMENT;
    this.nodeName = '#document';
    this.documentElement = this.createElement('html');
    this.appendChild(this.documentElement);
    this.body = this.documentElement.appendChild(this.createElement('body'));
    this.activeElement = this.body;
    this.oninput = null; // React asks whether 'input' events exist with `'oninput' in document`.
  }
  /** Focus moves: focusout on the element leaving, focusin on the one coming (once installed). */
  moveFocus(to) {
    const from = this.activeElement;
    if (from === to) return;
    this.activeElement = to;
    if (!this.fire) return;
    if (from && from !== this.body) this.fire(from, 'focusout', { relatedTarget: to });
    if (to !== this.body) this.fire(to, 'focusin', { relatedTarget: from });
  }
  createElement(tag) { return new MiniElement(this, tag); }
  createElementNS(namespace, tag) { return new MiniElement(this, tag, namespace); }
  createTextNode(data) { return new MiniText(this, data); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

/**
 * Put a fresh window and document on globalThis.
 * @param {{ width?: number, reducedMotion?: boolean, focusEvents?: boolean }} [options]
 * @returns {{ window: object, document: MiniDocument, fire: Function, setReducedMotion: Function }}
 *   `setReducedMotion(on)`: what prefers-reduced-motion answers from now on
 *   (a screen reads it when it mounts). `focusEvents`: focus() and blur()
 *   fire focusout and focusin.
 */
export function installDom({ width = 1280, reducedMotion = false, focusEvents = false } = {}) {
  const document = new MiniDocument();
  let reduced = reducedMotion;
  const window = {
    document, innerWidth: width, innerHeight: 800, event: undefined, _listeners: [],
    HTMLIFrameElement: class HTMLIFrameElement {},
    matchMedia: query => ({ matches: /prefers-reduced-motion: reduce/.test(query) ? reduced : false, media: query, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ overflowY: 'visible', getPropertyValue: () => '' }),
  };
  window.addEventListener = MiniNode.prototype.addEventListener.bind(window);
  window.removeEventListener = MiniNode.prototype.removeEventListener.bind(window);
  window.window = window;
  window.self = window;
  document.defaultView = window;
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });

  /** Dispatch an event at `target`: capture down from `window`, then bubble up. */
  function fire(target, type, init = {}) {
    const path = [];
    for (let n = target; n; n = n.parentNode) path.push(n);
    path.push(window);
    const event = {
      type, target, bubbles: init.bubbles ?? true, cancelable: true, defaultPrevented: false, isTrusted: true,
      timeStamp: Date.now(), eventPhase: 0, currentTarget: null, button: 0, buttons: 1, ...init,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
      stopImmediatePropagation() { this._stopped = true; },
      composedPath: () => path,
    };
    const invoke = (node, capture) => {
      event.currentTarget = node;
      for (const l of [...node._listeners]) if (l.type === type && l.capture === capture) l.fn.call(node, event);
    };
    const previous = window.event;
    window.event = event;
    try {
      for (const node of [...path].reverse()) { if (event._stopped) break; if (node !== target) invoke(node, true); }
      if (!event._stopped) { invoke(target, true); invoke(target, false); }
      if (event.bubbles) for (const node of path.slice(1)) { if (event._stopped) break; invoke(node, false); }
    } finally {
      window.event = previous;
    }
    return event;
  }
  if (focusEvents) document.fire = fire;
  return { window, document, fire, setReducedMotion: on => { reduced = on; } };
}
