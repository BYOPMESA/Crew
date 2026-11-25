// Runs the REAL browser screen modules under jsdom with a faked API, so signed-in screens can be
// verified without a browser session or real credentials. Import this file FIRST in every client test.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

for (const key of ['window', 'document', 'location', 'history', 'localStorage', 'navigator', 'Node', 'HTMLElement', 'Element']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true, writable: true });
}
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.scrollTo = () => {};
window.scrollTo = () => {};

export { window };
export const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();

/** Route table: 'METHOD /api/path' -> body, or (opts) => body, or { status, body }. Calls are recorded. */
export function mockApi(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method ?? 'GET').toUpperCase();
    const path = new URL(url, 'http://localhost').pathname;
    const key = `${method} ${path}`;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body });
    let handler = routes[key];
    if (handler === undefined) handler = { status: 404, body: { error: 'not_found' } };
    if (typeof handler === 'function') handler = handler({ body });
    // An HTTP-style envelope is { status: <number>, body }. A plain payload may itself have a "status" field
    // (a trip has status: "planning"), so only a NUMERIC status counts as an envelope.
    const { status = 200, body: payload = handler } = typeof handler?.status === 'number' ? handler : { body: handler };
    // Clone like a real JSON round-trip so screens can never share (or mutate) a test's fixture objects.
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(payload) };
  };
  return calls;
}

export function resetDom(path = '/') {
  window.history.replaceState(null, '', path);
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
}

/**
 * Fails if a screen shows leaked JavaScript values as text. Passing null/false/undefined to
 * replaceChildren() or append() turns them into the literal text "null" / "false" / "undefined".
 */
export function assertClean(node, where = 'screen') {
  // Inspect each text node on its own: adjacent text nodes concatenate ("...linknullCrew"), which hides
  // a stray "null" from any whole-string regex.
  const walker = document.createTreeWalker(node, window.NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const value = t.nodeValue.trim();
    if (/^(null|undefined|NaN|false|true)$/.test(value) || /\[object \w+\]|\bundefined\b|\bNaN\b/.test(value)) {
      throw new Error(`stray "${value.slice(0, 40)}" text node on ${where} (inside <${t.parentElement?.tagName.toLowerCase()} class="${t.parentElement?.className}">)`);
    }
  }
}

/**
 * Structural accessibility problems that can be detected without a browser (issue #44). Colour contrast and
 * real keyboard behaviour still need a manual pass. Returns a list of human-readable problems.
 */
export function a11yProblems(root) {
  const problems = [];
  const mains = root.matches?.('main') ? 1 : root.querySelectorAll('main').length;
  if (mains !== 1) problems.push(`expected exactly one <main> landmark, found ${mains}`);
  if (!root.querySelector('h1, h2')) problems.push('no heading (h1/h2) to announce the screen');

  const accessibleName = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
  const where = (el) => `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}>`;

  for (const el of root.querySelectorAll('button, a[href]')) {
    if (!accessibleName(el)) problems.push(`${where(el)} has no accessible name`);
  }
  for (const el of root.querySelectorAll('button')) {
    if (!el.hasAttribute('type')) problems.push(`${where(el)} has no type (it would submit a form by accident)`);
  }
  const labels = [...root.querySelectorAll('label')];
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (el.type === 'hidden') continue;
    const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && labels.some((l) => l.htmlFor === el.id));
    if (!named) problems.push(`${where(el)} has no label`);
  }
  const ids = [...root.querySelectorAll('[id]')].map((e) => e.id);
  for (const id of new Set(ids.filter((v, i) => ids.indexOf(v) !== i))) problems.push(`duplicate id "${id}"`);
  for (const el of root.querySelectorAll('[role="progressbar"]')) {
    if (!el.getAttribute('aria-label') || el.getAttribute('aria-valuenow') == null) problems.push(`${where(el)} progressbar needs a label and a value`);
  }
  return problems;
}

export function assertAccessible(node, where = 'screen') {
  const problems = a11yProblems(node);
  if (problems.length) throw new Error(`accessibility problems on ${where}:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Attach a node to the page (so isConnected/closest work like in the app). Every mounted screen is scanned for
 * stray values AND audited for structural accessibility, so any test that renders a screen also checks both.
 */
export function mount(node) {
  document.getElementById('app').replaceChildren(node);
  assertClean(node, 'mounted screen');
  assertAccessible(node, 'mounted screen');
  return node;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
