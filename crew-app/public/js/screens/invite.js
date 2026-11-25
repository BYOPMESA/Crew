import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { initial } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { backLink, busy, errorBox, icon, screen } from '../lib/ui.js';

/** A09: invite the crew. One personal, single-use link per friend; shown once; replace or cancel any time. */
export async function inviteScreen(me, { params }) {
  document.title = 'Invite the crew · crew.com';
  const tripId = params.id;
  const [data, invitesInitial] = await Promise.all([api('GET', `/trips/${tripId}`), api('GET', `/trips/${tripId}/invitations`)]);
  if (!data.is_organiser) {
    navigate(`/trips/${tripId}`, { replace: true });
    return;
  }

  let invites = invitesInitial;
  let shown = null; // { name, link } - the one-time link, kept only in memory
  const err = errorBox();
  const view = h('div', { class: 'sec', style: 'gap:13px' });

  const reload = async () => {
    invites = await api('GET', `/trips/${tripId}/invitations`);
    paint();
  };
  const run = async (button, label, fn) => {
    err.clear();
    try {
      await busy(button, label, fn);
      await reload();
    } catch (error) {
      err.show(error.message);
    }
  };

  function linkCard() {
    const input = h('input', { type: 'text', readonly: true, value: shown.link, 'aria-label': `Invite link for ${shown.name}`, onfocus: (e) => e.target.select() });
    const copy = h('button', { type: 'button', class: 'pill-btn' }, 'Copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shown.link);
        copy.textContent = 'Copied';
      } catch {
        input.focus();
        input.select();
        copy.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => (copy.textContent = 'Copy'), 2000);
    });
    const share = navigator.share
      ? h('button', { type: 'button', class: 'cta', onclick: () => navigator.share({ title: 'Join our trip on crew.com', text: `${shown.name}, join our trip on crew.com`, url: shown.link }).catch(() => {}) }, 'Share invite')
      : null;
    return h('div', { class: 'card', role: 'status' },
      h('div', { class: 'eyebrow' }, `Link for ${shown.name}`),
      h('div', { class: 'linkrow' }, input, copy),
      h('div', { class: 'small', style: 'margin-top:8px' }, 'Shown once. It works for one person and expires in 7 days. Lost it? Make a new link below.'),
      share && h('div', { style: 'margin-top:10px' }, share),
    );
  }

  function crewList() {
    const joined = data.members.map((m) =>
      h('div', { class: 'crewrow' },
        h('div', { class: 'av t', 'aria-hidden': 'true' }, initial(m.display_name)),
        h('div', {}, h('b', {}, m.display_name), h('div', { class: 's' }, m.user_id === me.id ? 'You' : 'Member', m.role === 'organiser' ? ' · Organiser' : '')),
        h('span', { class: 'badge joined' }, 'Joined'),
      ),
    );
    const pending = invites
      .filter((i) => i.state !== 'used')
      .map((i) => {
        const expired = i.state === 'expired';
        const replace = h('button', { type: 'button', class: 'pill-btn' }, 'New link');
        replace.addEventListener('click', () =>
          run(replace, '…', async () => {
            const res = await api('POST', `/trips/${tripId}/invitations/${i.id}/replace`);
            shown = { name: i.invitee_name, link: res.link };
          }),
        );
        const cancel = h('button', { type: 'button', class: 'pill-btn grey' }, 'Cancel');
        cancel.addEventListener('click', () =>
          run(cancel, '…', async () => {
            await api('POST', `/trips/${tripId}/invitations/${i.id}/revoke`);
            if (shown?.name === i.invitee_name) shown = null;
          }),
        );
        return h('div', { class: 'crewrow' },
          h('div', { class: 'av y', 'aria-hidden': 'true' }, initial(i.invitee_name)),
          h('div', {}, h('b', {}, i.invitee_name), h('div', { class: 's' }, expired ? 'Link expired' : 'Invite link created')),
          h('span', { class: 'badge planning' }, expired ? 'Expired' : 'Pending'),
          h('div', { style: 'display:flex;gap:6px;margin-left:6px' }, replace, !expired && cancel),
        );
      });
    return h('div', { class: 'card', style: 'padding:2px 14px' }, joined, pending);
  }

  function paint() {
    const name = h('input', { id: 'invitee_name', type: 'text', maxlength: 60, required: true, autocomplete: 'off', placeholder: "Friend's name" });
    const create = h('button', { class: 'cta', type: 'submit' }, 'Create invite link');
    const form = h('form', {
      class: 'sec',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        if (!name.value.trim()) {
          err.show("Enter your friend's name.");
          name.focus();
          return;
        }
        await run(create, 'Creating…', async () => {
          const res = await api('POST', `/trips/${tripId}/invitations`, { invitee_name: name.value });
          shown = { name: res.invitation.invitee_name, link: res.link };
        });
      },
    },
      h('label', { class: 'eyebrow', for: 'invitee_name' }, 'Add a friend'),
      h('div', { class: 'field' }, name),
      create,
    );
    view.replaceChildren(
      form,
      err.node,
      shown && linkCard(),
      h('div', { class: 'sec' }, h('span', { class: 'eyebrow' }, 'Crew'), crewList()),
      h('div', { class: 'ai-note' }, icon('sparkle'), 'Friends set their own preferences and a personal budget after joining. Only the average budget is shared.'),
      h('div', { class: 'ai-note' }, icon('sparkle'), "Email invites aren't set up yet. Copy the link and send it to your friend yourself."),
    );
  }
  paint();

  return screen(
    h('div', { class: 'hdr' }, backLink(`/trips/${tripId}`, 'Back to trip'), h('div', {}, h('div', { class: 'eyebrow active' }, data.trip.name))),
    h('h1', {}, 'Invite the ', h('em', {}, 'crew.')),
    view,
  );
}
