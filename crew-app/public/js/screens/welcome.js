import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { crewIdentity, dateRange, firstName, initial } from '../lib/format.js';
import { icon, link, screen } from '../lib/ui.js';

/** B04: "You're in". Shows who is in and who is still pending, then sends the invitee to set preferences. */
export async function welcomeScreen(me, { params }) {
  document.title = "You're in · crew.com";
  const [data, invites] = await Promise.all([api('GET', `/trips/${params.id}`), api('GET', `/trips/${params.id}/invitations`)]);
  const { trip, members } = data;

  const row = (letter, tone, name, sub, badge) =>
    h('div', { class: 'crewrow' }, h('div', { class: `av ${tone}`, 'aria-hidden': 'true' }, letter), h('div', {}, h('b', {}, name), h('div', { class: 's' }, sub)), badge);
  const who = crewIdentity(members);
  const memberRows = members.map((m) =>
    row(who.get(m.user_id).initials, 't', who.get(m.user_id).name, m.user_id === me.id ? 'You' : m.role === 'organiser' ? 'Organiser' : 'Member', h('span', { class: 'badge yes' }, 'In')),
  );
  const pendingRows = invites
    .filter((i) => i.state === 'valid')
    .map((i) => row(initial(i.invitee_name), 'y', i.invitee_name, 'Invite sent', h('span', { class: 'badge planning' }, 'Pending')));

  return screen(
    h('div', { style: 'display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-top:14px' },
      h('div', { style: 'width:84px;height:84px;border-radius:50%;background:var(--grad);box-shadow:var(--sh-cta);display:grid;place-items:center;color:#fff', 'aria-hidden': 'true' }, icon('check')),
      h('h1', {}, "You're in, ", h('em', {}, `${firstName(me.display_name)}!`)),
      h('div', { class: 'eyebrow active' }, [trip.name, trip.destination, dateRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · ')),
    ),
    h('div', { class: 'card', style: 'padding:2px 14px' }, memberRows, pendingRows),
    h('div', { class: 'ai-note' }, icon('sparkle'), 'Set your preferences next and add your own budget. Only the crew average is ever shown to others.'),
    h('div', { class: 'grow' }),
    link(`/trips/${params.id}/preferences`, { class: 'cta' }, 'Set my preferences ', icon('arrow')),
  );
}
