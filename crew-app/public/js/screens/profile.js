import { api, clearMe } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { initial } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { bottomNav, busy, errorBox, screen } from '../lib/ui.js';

export function profileScreen(me) {
  document.title = 'Profile · crew.com';
  const err = errorBox();
  const out = h('button', { class: 'cta2', type: 'button' }, 'Log out');
  out.addEventListener('click', async () => {
    err.clear();
    try {
      await busy(out, 'Logging out…', () => api('POST', '/auth/logout'));
      clearMe();
      navigate('/login');
    } catch (error) {
      err.show(error.message);
    }
  });

  return screen(
    h('div', { class: 'rowbet' }, h('h2', {}, 'Profile'), h('div', { class: 'step-av', 'aria-hidden': 'true' }, initial(me.display_name))),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Name'), h('b', { style: 'font-size:15px' }, me.display_name), h('div', { class: 'eyebrow', style: 'margin-top:12px' }, 'Email'), h('div', { style: 'font-size:13px;margin-top:3px' }, me.email)),
    err.node,
    out,
    h('div', { class: 'grow' }),
    bottomNav('person'),
  );
}
