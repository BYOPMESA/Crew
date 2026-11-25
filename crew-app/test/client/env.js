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
    const { status = 200, body: payload = handler } = handler?.status ? handler : { body: handler };
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return calls;
}

export function resetDom(path = '/') {
  window.history.replaceState(null, '', path);
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
}

/** Attach a node to the page (so isConnected/closest work like in the app). */
export function mount(node) {
  document.getElementById('app').replaceChildren(node);
  return node;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
