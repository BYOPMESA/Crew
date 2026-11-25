import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { STATUS_LABEL, crewIdentity, dateRange, inr, nights } from '../lib/format.js';
import { nextActions } from '../lib/nextActions.js';
import { backLink, bottomNav, busy, errorBox, icon, link, screen } from '../lib/ui.js';

const AVATAR_TONES = ['t', 'g', 'y'];
const MAX_AVATARS = 5;

/**
 * Trip dashboard (A12, issue #20). Everything on it comes from what the API returned: the hero and stats from the
 * trip and the crew-average function, "Up next" from nextActions(). Explore cards and weather from the mockup are
 * deliberately absent: there is no places or weather source yet, and the PRD forbids invented reviews and forecasts.
 */
export async function tripScreen(me, { params }) {
  // Invitations enrich "Up next". If they cannot be loaded the dashboard still works and just says nothing about invites.
  const [data, invites] = await Promise.all([
    api('GET', `/trips/${params.id}`),
    api('GET', `/trips/${params.id}/invitations`).catch(() => null),
  ]);
  const { trip, members, crew_budget: cb, is_organiser: isOrganiser } = data;
  document.title = `${trip.name} · crew.com`;

  const n = nights(trip.start_date, trip.end_date);
  const expected = cb.expected ?? trip.expected_size ?? members.length;
  const who = crewIdentity(members);

  // ---- stats (A12: budget / nights / crew avatars)
  const budgetValue = cb.average_minor != null ? inr(cb.average_minor) : '—';
  let budgetNote;
  if (cb.submitted === 0) budgetNote = 'No budgets shared yet';
  else if (cb.average_minor == null) budgetNote = 'Average appears once a second person shares';
  else budgetNote = `${cb.submitted} of ${expected} people have shared a budget`;

  const shownMembers = members.slice(0, MAX_AVATARS);
  const extra = members.length - shownMembers.length;
  const avatars = h('div', { class: 'avatars', 'aria-hidden': 'true', style: 'justify-content:center;height:20px;margin-bottom:2px' },
    shownMembers.map((m, i) => h('div', { class: `av ${AVATAR_TONES[i % AVATAR_TONES.length]}` }, who.get(m.user_id).initials)),
    extra > 0 && h('div', { class: 'av more' }, `+${extra}`),
  );

  // ---- destination (organiser) - also the target of the "Choose a destination" Up-next item
  const dest = h('input', { id: 'destination', type: 'text', maxlength: 120, value: trip.destination ?? '', placeholder: 'e.g. Goa', 'aria-label': 'Destination' });
  const err = errorBox();
  const saved = h('div', { class: 'note', role: 'status', hidden: true }, 'Destination saved.');
  const saveDest = h('button', { class: 'cta2', type: 'button' }, 'Save destination');

  // ---- dynamic parts: repainted when the destination changes.
  // The screen keeps its own copy of what can change; the objects the API returned are never mutated.
  let destination = trip.destination ?? null;
  const eyebrow = h('div', { class: 'eyebrow', style: 'color:rgba(255,255,255,.85)' });
  const nextList = h('ul', { class: 'next-list', 'aria-label': 'Up next' });
  const moreNote = h('div', { class: 'small center', hidden: true });

  function nextRow(item, primaryId) {
    const body = [
      h('div', { class: 'ico-sq', 'aria-hidden': 'true' }, icon(item.icon)),
      h('span', { class: 'nx' }, h('b', {}, item.title), item.detail && h('small', {}, item.detail)),
    ];
    const attrs = { class: `next${item.id === primaryId ? ' primary' : ''}${item.kind === 'info' ? ' info' : ''}`, 'data-testid': 'next-item', 'data-item': item.id };
    const chev = h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chev'));
    if (item.kind === 'info') return h('li', {}, h('div', attrs, ...body));
    if (item.kind === 'focus') {
      const jump = (e) => {
        e.preventDefault();
        const target = document.getElementById(item.focus);
        target?.scrollIntoView?.({ block: 'center' });
        target?.focus();
      };
      return h('li', {}, h('a', { ...attrs, href: `#${item.focus}`, onclick: jump }, ...body, chev));
    }
    return h('li', {}, link(item.href, attrs, ...body, chev));
  }

  function paintDynamic() {
    eyebrow.textContent = destination ?? 'Destination not chosen yet';
    const next = nextActions({ tripId: params.id, trip: { ...trip, destination }, isOrganiser, meId: me.id, members, invites });
    nextList.replaceChildren(...next.items.map((item) => nextRow(item, next.primaryId)));
    moreNote.hidden = next.hidden === 0;
    moreNote.textContent = next.hidden === 0 ? '' : `${next.hidden} more once these are done`;
  }
  paintDynamic();

  saveDest.addEventListener('click', async () => {
    err.clear();
    saved.hidden = true;
    try {
      const updated = await busy(saveDest, 'Saving…', () => api('PATCH', `/trips/${params.id}`, { destination: dest.value.trim() || null }));
      destination = updated.destination ?? null;
      paintDynamic();
      saved.hidden = false;
    } catch (error) {
      err.show(error.message);
    }
  });

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
      h('div', { class: 'tx' }, eyebrow, h('h1', {}, trip.name), h('div', { style: 'font-size:12px;margin-top:4px;opacity:.95' }, `${dateRange(trip.start_date, trip.end_date)}${n != null ? ` · ${n} night${n === 1 ? '' : 's'}` : ''}`)),
    ),
    // The plain ' ' between value and label keeps them readable as "₹6,500 crew budget / person" by assistive tech.
    h('div', { class: 'stats' },
      h('div', { class: 'm' }, h('b', {}, budgetValue), ' ', h('span', {}, 'crew budget / person')),
      h('div', { class: 'm' }, h('b', {}, n != null ? String(n) : '—'), ' ', h('span', {}, n === 1 ? 'night' : 'nights')),
      h('div', { class: 'm' }, avatars, ' ', h('span', {}, `${members.length} of ${expected} joined`)),
    ),
    h('div', { class: 'small center', 'data-testid': 'budget-note' }, budgetNote),
    h('div', { class: 'sec', style: 'gap:7px' }, h('span', { class: 'eyebrow' }, 'Up next'), nextList, moreNote),
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
