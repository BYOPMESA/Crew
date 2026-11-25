import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { STATUS_LABEL, dateRange, firstName, initial } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { bottomNav, busy, errorBox, icon, link, screen } from '../lib/ui.js';

export async function homeScreen(me) {
  document.title = 'Home · crew.com';
  const trips = await api('GET', '/trips');
  const err = errorBox();

  const newPlan = h('button', { class: 'cta', type: 'button' }, 'New plan');
  newPlan.addEventListener('click', async () => {
    err.clear();
    try {
      const trip = await busy(newPlan, 'Creating…', () => api('POST', '/trips', {}));
      navigate(`/trips/${trip.id}/preferences`);
    } catch (error) {
      err.show(error.message);
    }
  });

  const tripCard = (t) =>
    link(`/trips/${t.id}`, { class: 'card tripcard' },
      h('div', { class: 'strip plain' }, icon('pin'), h('span', { class: `badge ${t.status === 'planning' ? 'planning' : 'joined'}` }, STATUS_LABEL[t.status] ?? t.status)),
      h('div', { class: 'bd' },
        h('div', {}, h('div', { class: 't' }, t.name), h('div', { class: 's' }, `${t.destination ? `${t.destination} · ` : ''}${dateRange(t.start_date, t.end_date)} · ${t.member_count} crew`)),
      ),
    );

  return screen(
    h('div', { class: 'rowbet' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Welcome back'), h('h2', { style: 'margin-top:3px' }, `Hi, ${firstName(me.display_name)}`)), h('div', { class: 'step-av', 'aria-hidden': 'true' }, initial(me.display_name))),
    newPlan,
    err.node,
    h('div', { class: 'sec-h' }, h('span', { class: 'eyebrow' }, 'Recent trips')),
    trips.length
      ? h('div', { class: 'sec', style: 'gap:12px' }, trips.map(tripCard))
      : h('div', { class: 'card' }, h('b', {}, 'No trips yet'), h('p', { style: 'margin-top:4px' }, 'Start a plan, set your budget and preferences, then bring your crew in.')),
    h('div', { class: 'grow' }),
    bottomNav('home'),
  );
}
