import { crewIdentity } from './format.js';

/**
 * "Up next" for the trip dashboard (issue #20). Pure function: real trip + crew + invitation data in,
 * an ordered list of what needs attention out. Nothing here is invented:
 *   - every item is derived from a field the API actually returned;
 *   - an item only links somewhere that exists today (preferences, basics, invite, waiting);
 *   - states that have no screen yet (voting open/closed) are shown as information, not as a dead link.
 *
 * Item kinds: 'link' (navigates), 'focus' (jumps to a control on the same page), 'info' (no action).
 */
export const MAX_ITEMS = 5;

const done = (m) => Boolean(m.has_preferences && m.has_budget);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "Aisha", "Aisha and Rahul", "Aisha, Rahul and Manas", "Aisha, Rahul and 2 others". */
export function listNames(names, max = 3) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list.join('');
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  const rest = list.length - (max - 1);
  return `${list.slice(0, max - 1).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

export function nextActions({ tripId, trip, isOrganiser, meId, members, invites }) {
  const base = `/trips/${tripId}`;
  const who = crewIdentity(members);
  const mine = members.find((m) => m.user_id === meId);
  const items = [];
  const add = (item) => items.push({ kind: 'link', ...item });

  // Voting has no screen yet, so its state is information only.
  if (trip.status === 'voting') add({ id: 'voting-open', kind: 'info', icon: 'vote', title: 'Voting is open', detail: 'The crew is voting on the plan.' });
  if (trip.status === 'closed') add({ id: 'voting-closed', kind: 'info', icon: 'check', title: 'Voting is closed' });

  // My own step first: nothing else matters until my preferences and budget are in.
  if (mine && !done(mine)) {
    const title = !mine.has_preferences && !mine.has_budget ? 'Set your preferences and budget' : !mine.has_preferences ? 'Save your preferences' : 'Add your budget';
    add({ id: 'my-preferences', icon: 'sliders', title, detail: 'Your budget stays private. Only the crew average is shown.', href: `${base}/preferences` });
  }

  if (isOrganiser) {
    const missing = [!(trip.start_date && trip.end_date) && 'dates', !trip.expected_size && 'crew size'].filter(Boolean);
    if (missing.length) {
      add({ id: 'basics', icon: 'calendar', title: 'Finish the trip basics', detail: `Still missing: ${missing.join(' and ')}.`, href: `${base}/basics` });
    }
    if (!trip.destination) {
      add({ id: 'destination', kind: 'focus', icon: 'pin', title: 'Choose a destination', detail: 'Type it in "Where to?" below.', focus: 'destination' });
    }

    // Invitation state is only used when it could actually be loaded; otherwise say nothing rather than guess.
    if (invites) {
      const valid = invites.filter((i) => i.state === 'valid');
      const expired = invites.filter((i) => i.state === 'expired');
      if (invites.length === 0) {
        add({ id: 'invite', icon: 'users', title: 'Invite your crew', detail: 'Create a personal link for each friend.', href: `${base}/invite` });
      } else {
        if (expired.length) {
          add({ id: 'invites-expired', icon: 'clock', title: `${plural(expired.length, 'invite link has', 'invite links have')} expired`, detail: `${listNames(expired.map((i) => i.invitee_name))}: make a new link.`, href: `${base}/invite` });
        }
        if (valid.length) {
          add({ id: 'invites-pending', icon: 'users', title: `${plural(valid.length, 'invite', 'invites')} waiting to join`, detail: listNames(valid.map((i) => i.invitee_name)), href: `${base}/invite` });
        }
        const unaccounted = trip.expected_size ? trip.expected_size - members.length - valid.length : 0;
        if (unaccounted > 0) {
          add({ id: 'invite-more', icon: 'users', title: `Invite ${plural(unaccounted, 'more friend', 'more friends')}`, detail: `Crew size is ${trip.expected_size}.`, href: `${base}/invite` });
        }
      }
    }
  } else {
    // A plain member can only see what the organiser has not set yet.
    const unset = [!trip.destination && 'destination', !(trip.start_date && trip.end_date) && 'dates'].filter(Boolean);
    if (unset.length) add({ id: 'organiser-pending', kind: 'info', icon: 'clock', title: `The organiser has not set the ${unset.join(' and ')} yet` });
  }

  // Who the crew is still waiting on (excluding me: my own step is handled above).
  const waiting = members.filter((m) => m.user_id !== meId && !done(m));
  if (waiting.length) {
    add({ id: 'waiting', icon: 'clock', title: `Waiting on ${listNames(waiting.map((m) => who.get(m.user_id).short))}`, detail: 'They have not finished their preferences and budget yet.', href: `${base}/waiting` });
  } else if (members.length > 1 && members.every(done)) {
    add({ id: 'crew-ready', kind: 'info', icon: 'check', title: 'Everyone who has joined has finished their preferences' });
  }

  if (items.length === 0) {
    items.push({ id: 'all-caught-up', kind: 'info', icon: 'check', title: "You're all caught up", detail: 'Nothing needs your attention right now.' });
  }

  const shown = items.slice(0, MAX_ITEMS);
  const firstAction = shown.find((i) => i.kind !== 'info');
  return { items: shown, hidden: items.length - shown.length, primaryId: firstAction?.id ?? null };
}
