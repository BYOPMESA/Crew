import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { STATUS_LABEL, crewIdentity, dateRange, inr, nights } from '../lib/format.js';
import { backLink, bottomNav, busy, errorBox, icon, link, screen } from '../lib/ui.js';

/** Trip home: real state only. Budget average is the sole crew-wide number, as the PRD decides. */
export async function tripScreen(me, { params }) {
  const data = await api('GET', `/trips/${params.id}`);
  const { trip, members, crew_budget: cb, is_organiser: isOrganiser } = data;
  document.title = `${trip.name} · crew.com`;

  const n = nights(trip.start_date, trip.end_date);
  const expected = cb.expected ?? trip.expected_size ?? members.length;

  const budgetValue = cb.average_minor != null ? inr(cb.average_minor) : '—';
  let budgetNote;
  if (cb.submitted === 0) budgetNote = 'No budgets shared yet';
  else if (cb.average_minor == null) budgetNote = 'Average appears once a second person shares';
  else budgetNote = `${cb.submitted} of ${expected} people have shared a budget`;

  const dest = h('input', { id: 'destination', type: 'text', maxlength: 120, value: trip.destination ?? '', placeholder: 'e.g. Goa', 'aria-label': 'Destination' });
  const err = errorBox();
  const saved = h('div', { class: 'note', role: 'status', hidden: true }, 'Destination saved.');
  const saveDest = h('button', { class: 'cta2', type: 'button' }, 'Save destination');
  saveDest.addEventListener('click', async () => {
    err.clear();
    saved.hidden = true;
    try {
      await busy(saveDest, 'Saving…', () => api('PATCH', `/trips/${params.id}`, { destination: dest.value.trim() || null }));
      saved.hidden = false;
    } catch (error) {
      err.show(error.message);
    }
  });

  const who = crewIdentity(members);
  const crewRow = (m) =>
    h('div', { class: 'crewrow' },
      h('div', { class: 'av t', 'aria-hidden': 'true' }, who.get(m.user_id).initials),
      h('div', {}, h('b', {}, who.get(m.user_id).name), h('div', { class: `s${m.has_preferences ? ' done' : ''}` }, m.role === 'organiser' ? 'Organiser' : 'Member', ' · ', m.has_preferences ? 'Preferences saved' : 'Preferences not saved yet')),
      h('span', { class: `badge ${m.has_preferences && m.has_budget ? 'yes' : 'planning'}` }, m.has_preferences && m.has_budget ? 'Done' : 'Waiting'),
    );

  return screen(
    h('div', { class: 'hdr' }, backLink('/', 'Back to home')),
    h('div', { class: 'hero plain' },
      h('span', { class: 'badge best' }, STATUS_LABEL[trip.status] ?? trip.status),
      h('div', { class: 'tx' }, h('div', { class: 'eyebrow', style: 'color:rgba(255,255,255,.85)' }, trip.destination ?? 'Destination not chosen yet'), h('h1', {}, trip.name), h('div', { style: 'font-size:12px;margin-top:4px;opacity:.95' }, `${dateRange(trip.start_date, trip.end_date)}${n != null ? ` · ${n} night${n === 1 ? '' : 's'}` : ''}`)),
    ),
    h('div', { class: 'stat-grid' },
      h('div', { class: 'm' }, h('b', {}, budgetValue), h('span', {}, 'crew budget / person')),
      h('div', { class: 'm' }, h('b', {}, String(members.length)), h('span', {}, `of ${expected} joined`)),
    ),
    h('div', { class: 'small center', 'data-testid': 'budget-note' }, budgetNote),
    isOrganiser &&
      h('div', { class: 'sec' },
        h('label', { class: 'eyebrow', for: 'destination' }, 'Where to?'),
        h('div', { class: 'field' }, dest),
        saveDest,
        saved,
        err.node,
      ),
    h('div', { class: 'sec' },
      h('span', { class: 'eyebrow' }, 'Crew'),
      h('div', { class: 'card', style: 'padding:2px 14px' }, members.map(crewRow)),
    ),
    isOrganiser && link(`/trips/${params.id}/invite`, { class: 'cta' }, 'Invite the crew'),
    h('div', { class: 'btnrow', style: 'flex:none' },
      link(`/trips/${params.id}/preferences`, { class: 'cta2', style: 'height:50px' }, 'Edit my preferences'),
      isOrganiser && link(`/trips/${params.id}/basics`, { class: 'cta2', style: 'height:50px' }, 'Edit trip details'),
    ),
    h('div', { class: 'grow' }),
    bottomNav('home'),
  );
}
