const routes = [];
let outlet;
let renderId = 0;

/** route('/trips/:id', handler) - handler({ params, query }) returns a DOM node (or undefined if it navigated). */
export function route(pattern, handler) {
  const keys = [];
  const source = pattern.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  routes.push({ re: new RegExp(`^${source}/?$`), keys, handler });
}

export function navigate(to, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  return render();
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/';
}

async function render() {
  const id = ++renderId;
  const path = location.pathname;
  outlet.replaceChildren(loading());
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    let node;
    try {
      node = await r.handler({ params, query: new URLSearchParams(location.search) });
    } catch (err) {
      if (id !== renderId) return;
      console.error(err);
      outlet.replaceChildren(errorScreen(err));
      return;
    }
    if (id !== renderId || !node) return; // superseded by a newer navigation, or handler redirected
    outlet.replaceChildren(node);
    const heading = node.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
    return;
  }
  outlet.replaceChildren(errorScreen(new Error('This page does not exist.')));
}

function loading() {
  const p = document.createElement('p');
  p.className = 'loading';
  p.setAttribute('role', 'status');
  p.textContent = 'Loading…';
  return p;
}

function errorScreen(err) {
  const main = document.createElement('main');
  main.className = 'screen';
  const h1 = document.createElement('h1');
  h1.textContent = 'Something went wrong';
  const p = document.createElement('p');
  p.textContent = err?.message || 'Please try again.';
  const a = document.createElement('a');
  a.className = 'cta';
  a.href = '/';
  a.dataset.link = '';
  a.textContent = 'Back to home';
  main.append(h1, p, a);
  return main;
}

export function start(el) {
  outlet = el;
  addEventListener('popstate', render);
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  return render();
}
