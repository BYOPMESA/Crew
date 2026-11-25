import { h, svg } from './dom.js';

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  home: `<svg width="22" height="22" viewBox="0 0 24 24" ${stroke}><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>`,
  person: `<svg width="22" height="22" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>`,
  back: `<svg width="18" height="18" viewBox="0 0 24 24" ${stroke}><path d="M15 6l-6 6 6 6"/></svg>`,
  arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  pin: `<svg width="26" height="26" viewBox="0 0 24 24" ${stroke}><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  sparkle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#8A6400"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`,
};
export const icon = (name) => svg(ICONS[name]);

export const logo = () =>
  h(
    'div',
    { class: 'logo' },
    h('div', { class: 'logo-mark' }, svg(
      '<svg viewBox="0 0 220 220" width="38" height="38" aria-hidden="true"><rect width="220" height="220" rx="50" fill="#1F8A87"/><path d="M143.4 70.2 A52 52 0 1 0 143.4 149.8" fill="none" stroke="#FAF6EE" stroke-width="28" stroke-linecap="round"/><circle cx="160" cy="110" r="18" fill="#F5B800"/></svg>',
    )),
    h('span', { class: 'logo-word' }, 'crew.com'),
  );

export const screen = (...children) => h('main', { class: 'screen' }, ...children);

export const link = (href, attrs, ...children) => h('a', { href, 'data-link': '', ...attrs }, ...children);

export const backLink = (href, label = 'Back') =>
  link(href, { class: 'back', 'aria-label': label, title: label }, icon('back'));

export const avatar = (letter, tone = 't') => h('div', { class: `step-av` }, letter);

export function bottomNav(active) {
  const item = (href, name, label) =>
    link(href, { class: active === name ? 'on' : '', 'aria-label': label, title: label, 'aria-current': active === name ? 'page' : null }, icon(name));
  return h('nav', { class: 'nav', 'aria-label': 'Main' }, item('/', 'home', 'Home'), item('/profile', 'person', 'Profile'));
}

/** Inline error area that screen readers announce. */
export function errorBox() {
  const box = h('div', { class: 'err', role: 'alert', hidden: true });
  return {
    node: box,
    show(message) {
      box.textContent = message;
      box.hidden = false;
    },
    clear() {
      box.hidden = true;
      box.textContent = '';
    },
  };
}

/** Disable a submit button while an async action runs; always re-enables. */
export async function busy(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export function field({ id, label, type = 'text', value = '', placeholder = '', autocomplete, required = false, maxlength, inputmode }) {
  const input = h('input', { id, name: id, type, value, placeholder, autocomplete, required, maxlength, inputmode });
  const node = h('div', { class: 'fgroup' }, h('label', { class: 'lbl', for: id }, label), h('div', { class: 'field' }, input));
  return { node, input };
}
