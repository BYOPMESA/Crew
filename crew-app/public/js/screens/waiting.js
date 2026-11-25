import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { initial } from '../lib/format.js';
import { backLink, icon, link, screen } from '../lib/ui.js';

const POLL_MS = 6000;

/** B06: waiting screen. Progress comes from what people have really saved (never invented) and refreshes on its own. */
export async function waitingScreen(me, { params, pollMs = POLL_MS }) {
  document.title = 'Waiting for the crew · crew.com';
  const id = params.id;
  const first = await api('GET', `/trips/${id}`);

  const list = h('div', { class: 'card', style: 'padding:2px 14px' });
  const fill = h('i', { style: 'width:0%' });
  const bar = h('div', { class: 'prog', role: 'progressbar', 'aria-label': 'Crew progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
  const count = h('div', { class: 'small center', role: 'status', 'data-testid': 'progress-count' });
  const headline = h('p', { 'data-testid': 'waiting-headline' });

  const state = (m) => (m.has_preferences && m.has_budget ? 'done' : m.has_preferences || m.has_budget ? 'partial' : 'none');
  const label = { done: 'Done', partial: 'In progress', none: 'Not started' };

  function paint({ members, trip }) {
    const done = members.filter((m) => state(m) === 'done').length;
    const total = Math.max(members.length, trip.expected_size ?? 0, 1);
    const pct = Math.round((done / total) * 100);
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    count.textContent = `${done} of ${total} done`;
    headline.textContent = done === members.length && members.length > 1
      ? 'Everyone who has joined has finished their preferences.'
      : "We're waiting for the rest of the crew to finish their preferences.";
    list.replaceChildren(
      ...members.map((m) =>
        h('div', { class: 'crewrow' },
          h('div', { class: 'av t', 'aria-hidden': 'true' }, initial(m.display_name)),
          h('div', {}, h('b', {}, m.display_name), h('div', { class: 's' }, m.user_id === me.id ? 'You' : m.role === 'organiser' ? 'Organiser' : 'Member')),
          h('span', { class: `badge ${state(m) === 'done' ? 'yes' : 'planning'}` }, label[state(m)]),
        ),
      ),
    );
  }
  paint(first);

  const root = screen(
    h('div', { class: 'hdr' }, backLink(`/trips/${id}`, 'Back to trip')),
    h('div', { style: 'display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-top:6px' },
      h('div', { style: 'width:76px;height:76px;border-radius:50%;background:var(--tint);display:grid;place-items:center;color:var(--teal)', 'aria-hidden': 'true' }, icon('check')),
      h('h1', {}, 'Nice - ', h('em', {}, "you're set.")),
      headline,
    ),
    bar,
    count,
    list,
    h('div', { class: 'grow' }),
    link(`/trips/${id}`, { class: 'cta2' }, 'Back to trip'),
  );

  // Refresh while this screen is on the page; stop as soon as the router replaces it.
  const timer = setInterval(async () => {
    if (!root.isConnected) return clearInterval(timer);
    try {
      paint(await api('GET', `/trips/${id}`));
    } catch {
      /* transient: keep the last good picture and try again */
    }
  }, pollMs);

  return root;
}
