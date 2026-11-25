import { api, clearMe } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { navigate, safeNext } from '../lib/router.js';
import { busy, errorBox, field, icon, link, logo, screen } from '../lib/ui.js';

const photo = (name) => `background-image:url(/assets/photos/${name}.jpg)`;

export function signupScreen({ query }) {
  document.title = 'Sign up · crew.com';
  const next = safeNext(query.get('next'));
  const name = field({ id: 'display_name', label: 'Full name', autocomplete: 'name', required: true, maxlength: 60 });
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const password = field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters', required: true });
  const err = errorBox();
  const done = h('div', { class: 'note', role: 'status', hidden: true });
  const submit = h('button', { class: 'cta', type: 'submit' }, 'Create account ', icon('arrow'));

  const form = h(
    'form',
    {
      class: 'sec',
      style: 'gap:13px',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.clear();
        try {
          const res = await busy(submit, 'Creating…', () =>
            api('POST', '/auth/signup', {
              display_name: name.input.value,
              email: email.input.value,
              password: password.input.value,
            }),
          );
          clearMe();
          if (res.needsConfirmation) {
            done.textContent = 'Almost there. Check your email and confirm your address, then log in.';
            done.hidden = false;
            form.querySelectorAll('input').forEach((i) => (i.disabled = true));
            submit.hidden = true;
          } else {
            navigate(next);
          }
        } catch (error) {
          err.show(error.message);
        }
      },
    },
    name.node,
    email.node,
    password.node,
    err.node,
    done,
    submit,
  );

  return screen(
    logo(),
    h('div', { class: 'collage' }, h('div', { class: 'photo wide', style: photo('beach') }), h('div', { class: 'stack' }, h('div', { class: 'photo', style: photo('cabin') }), h('div', { class: 'photo', style: photo('hills') }))),
    h('div', {}, h('h1', {}, 'Create your ', h('em', {}, 'account.')), h('p', { style: 'margin-top:6px' }, 'Trips, votes and fair splits - all in one place for your crew.')),
    form,
    h('div', { class: 'center', style: 'font-size:12.5px;color:var(--ink2)' }, 'Already have an account? ', link(`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`, { class: 'link' }, 'Log in')),
  );
}

export function loginScreen({ query }) {
  document.title = 'Log in · crew.com';
  const next = safeNext(query.get('next'));
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const password = field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'current-password', required: true });
  const err = errorBox();
  const submit = h('button', { class: 'cta', type: 'submit' }, 'Log in ', icon('arrow'));

  const form = h(
    'form',
    {
      class: 'sec',
      style: 'gap:13px',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.clear();
        try {
          await busy(submit, 'Logging in…', () => api('POST', '/auth/login', { email: email.input.value, password: password.input.value }));
          clearMe();
          navigate(next);
        } catch (error) {
          err.show(error.message);
        }
      },
    },
    email.node,
    password.node,
    err.node,
    submit,
  );

  return screen(
    logo(),
    h('div', { style: 'margin-top:18px' }, h('h1', {}, 'Welcome ', h('em', {}, 'back.')), h('p', { style: 'margin-top:6px' }, 'Log in to pick up where your crew left off.')),
    form,
    h('div', { class: 'center', style: 'font-size:12.5px;color:var(--ink2)' }, 'New to crew.com? ', link(`/signup${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`, { class: 'link' }, 'Sign up')),
  );
}
