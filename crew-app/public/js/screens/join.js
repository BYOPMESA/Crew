import { api, getMe } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { dateRange } from '../lib/format.js';
import { clearPendingInvite, rememberPendingInvite } from '../lib/pending.js';
import { navigate } from '../lib/router.js';
import { busy, errorBox, icon, link, logo, screen } from '../lib/ui.js';

/** B01: the public landing page for an invite link. Works logged out; the invitation survives sign-up/log-in via ?next=. */
export async function joinScreen({ params }) {
  document.title = "You're invited · crew.com";
  const token = params.token;
  const here = `/join/${token}`;

  let info;
  let me;
  try {
    [info, me] = await Promise.all([api('GET', `/invitations/${token}`), getMe()]);
  } catch (error) {
    if (error.status === 503) return notReady();
    throw error;
  }

  if (info.state !== 'valid') {
    clearPendingInvite();
    return deadEnd(info, me);
  }

  const err = errorBox();
  const { trip } = info;
  const dates = trip.start_date || trip.end_date ? dateRange(trip.start_date, trip.end_date) : null;
  const meta = [dates, `${info.crew_in} in`].filter(Boolean).join(' · ');

  let cta;
  let footer;
  if (me && info.member) {
    // Already in this trip: no join, no consumed link, just a way in.
    clearPendingInvite();
    cta = link(`/trips/${info.trip_id}`, { class: 'cta' }, 'Open trip ', icon('arrow'));
    footer = h('div', { class: 'small center' }, "You're already in this trip.");
  } else if (me) {
    cta = h('button', { class: 'cta', type: 'button' }, 'Join the trip ', icon('arrow'));
    cta.addEventListener('click', async () => {
      err.clear();
      try {
        const res = await busy(cta, 'Joining…', () => api('POST', `/invitations/${token}/accept`));
        clearPendingInvite();
        // replace: keep the one-time link out of the back-button history
        navigate(res.already_member ? `/trips/${res.trip_id}` : `/trips/${res.trip_id}/welcome`, { replace: true });
      } catch (error) {
        err.show(error.message);
        if (error.status === 410) {
          clearPendingInvite();
          cta.disabled = true;
        }
      }
    });
    footer = h('div', { class: 'small center' }, 'Joining as ', h('b', {}, me.display_name));
  } else {
    // Logged out: remember the link so it is not lost if sign-up needs an email confirmation first.
    rememberPendingInvite(token);
    cta = link(`/signup?next=${encodeURIComponent(here)}`, { class: 'cta' }, 'Join the trip ', icon('arrow'));
    footer = h('div', { class: 'center', style: 'font-size:12.5px;color:var(--ink2)' }, 'Already have an account? ', link(`/login?next=${encodeURIComponent(here)}`, { class: 'link' }, 'Log in instead'));
  }

  return screen(
    logo(),
    h('div', { class: 'hero plain', style: 'height:190px' },
      h('div', { class: 'tx' },
        h('div', { class: 'eyebrow', style: 'color:rgba(255,255,255,.9)' }, `${info.organiser} invited you to`),
        h('h1', {}, trip.name),
        trip.destination && h('div', { style: 'font-size:13px;margin-top:2px;opacity:.95' }, trip.destination),
      ),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, "You're invited"),
      h('div', { style: 'font-weight:700;font-size:15px;margin-top:4px' }, meta),
      h('div', { class: 'ai-note', style: 'margin-top:10px' }, icon('sparkle'), "You'll set your own preferences and your own budget. The plan shapes around everyone."),
    ),
    err.node,
    h('div', { class: 'grow' }),
    cta,
    footer,
  );
}

/** Used / expired / replaced / unknown links never dead-end: they explain and offer a way forward. */
function deadEnd(info, me) {
  return screen(
    logo(),
    h('div', { style: 'margin-top:24px' }, h('h1', {}, "This link can't be ", h('em', {}, 'used.')), h('p', { style: 'margin-top:8px' }, info.message)),
    h('div', { class: 'note' }, 'Ask the person who invited you to send a fresh link. Each link works once and lasts 7 days.'),
    h('div', { class: 'grow' }),
    link('/', { class: 'cta' }, me ? 'Go to my trips' : 'Go to crew.com'),
  );
}

/** The server has no service-role key yet (503): say so plainly instead of a generic error. */
function notReady() {
  return screen(
    logo(),
    h('div', { style: 'margin-top:24px' }, h('h1', {}, 'Invites are ', h('em', {}, 'not ready yet.')), h('p', { style: 'margin-top:8px' }, 'This crew.com server is still being set up, so invite links cannot be opened right now. Please try again a little later.')),
    h('div', { class: 'grow' }),
    link('/', { class: 'cta' }, 'Go to crew.com'),
  );
}
