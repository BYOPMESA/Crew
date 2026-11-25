import { api } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { initial, nights } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { backLink, busy, errorBox, icon, screen } from '../lib/ui.js';

/** A06: the basics. One clear trip name, dates (nights computed from them), crew size, notes. */
export async function basicsScreen(me, { params }) {
  document.title = 'Trip details · crew.com';
  const { trip, is_organiser: isOrganiser } = await api('GET', `/trips/${params.id}`);
  if (!isOrganiser) {
    navigate(`/trips/${params.id}`, { replace: true });
    return;
  }
  const err = errorBox();
  let size = trip.expected_size ?? 4;

  const name = h('input', { id: 'name', type: 'text', maxlength: 80, required: true, value: trip.name, autocomplete: 'off' });
  const start = h('input', { id: 'start_date', type: 'date', value: trip.start_date ?? '' });
  const end = h('input', { id: 'end_date', type: 'date', value: trip.end_date ?? '' });
  const notes = h('textarea', { id: 'notes', maxlength: 1000, rows: 3, placeholder: 'e.g. College friends, first trip together. Keep it budget-friendly.' }, trip.notes ?? '');
  const nightsChip = h('span', { class: 'chip sel filter', role: 'status' });
  const paintNights = () => {
    const n = nights(start.value, end.value);
    nightsChip.textContent = n == null ? 'Pick dates' : `${n} night${n === 1 ? '' : 's'}`;
    end.min = start.value || '';
  };
  start.addEventListener('input', paintNights);
  end.addEventListener('input', paintNights);
  paintNights();

  const sizeOut = h('output', { 'aria-live': 'polite', for: 'minus plus' }, String(size));
  const step = (delta) => {
    size = Math.min(20, Math.max(1, size + delta));
    sizeOut.textContent = String(size);
  };
  const minus = h('button', { type: 'button', class: 'rnd', id: 'minus', 'aria-label': 'Fewer people', onclick: () => step(-1) }, '−');
  const plus = h('button', { type: 'button', class: 'rnd p', id: 'plus', 'aria-label': 'More people', onclick: () => step(1) }, '+');

  const submit = h('button', { class: 'cta', type: 'submit' }, 'Continue ', icon('arrow'));
  const form = h(
    'form',
    {
      class: 'sec',
      style: 'gap:13px',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.clear();
        if (!name.value.trim()) {
          err.show('Give the trip a name.');
          name.focus();
          return;
        }
        if (start.value && end.value && end.value < start.value) {
          err.show('The end date must be on or after the start date.');
          end.focus();
          return;
        }
        try {
          await busy(submit, 'Saving…', () =>
            api('PATCH', `/trips/${params.id}`, {
              name: name.value.trim(),
              start_date: start.value || null,
              end_date: end.value || null,
              expected_size: size,
              notes: notes.value.trim() || null,
            }),
          );
          navigate(`/trips/${params.id}`);
        } catch (error) {
          err.show(error.message);
        }
      },
    },
    h('div', { class: 'sec' }, h('label', { class: 'eyebrow', for: 'name' }, 'Trip name'), h('div', { class: 'field' }, name)),
    h('div', { class: 'sec' },
      h('span', { class: 'eyebrow' }, 'Dates'),
      h('div', { class: 'card' },
        h('div', { class: 'row2' },
          h('div', { class: 'fgroup' }, h('label', { class: 'lbl', for: 'start_date' }, 'From'), h('div', { class: 'field' }, start)),
          h('div', { class: 'fgroup' }, h('label', { class: 'lbl', for: 'end_date' }, 'To'), h('div', { class: 'field' }, end)),
        ),
        h('div', { style: 'margin-top:10px' }, nightsChip),
      ),
    ),
    h('div', { class: 'sec' },
      h('span', { class: 'eyebrow' }, 'Crew size'),
      h('div', { class: 'card rowbet' }, h('div', { class: 'stepper' }, minus, sizeOut, plus, h('span', { class: 'small' }, 'people')), h('span', { class: 'small' }, "You can change this later")),
    ),
    h('div', { class: 'sec' }, h('label', { class: 'eyebrow', for: 'notes' }, 'Notes for the crew (optional)'), h('div', { class: 'field area' }, notes)),
    err.node,
    h('div', { class: 'grow' }),
    submit,
  );

  return screen(
    h('div', { class: 'step-head' },
      h('div', { class: 'top' }, backLink(`/trips/${params.id}/preferences`, 'Back to preferences'), h('div', { class: 'step-av', 'aria-hidden': 'true' }, initial(me.display_name)), h('div', { class: 'eyebrow active' }, 'Step 2 of 3 · Trip details')),
      h('h1', {}, 'The ', h('em', {}, 'basics.')),
    ),
    form,
  );
}
