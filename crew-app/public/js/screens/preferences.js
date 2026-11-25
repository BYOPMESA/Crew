import { api } from '../lib/api.js';
import { BUDGET_MAX, BUDGET_SLIDER, INTERESTS, STAY_STYLES, VIBES } from '../lib/constants.js';
import { h } from '../lib/dom.js';
import { firstName, initial, inrRupees } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { backLink, busy, errorBox, icon, screen } from '../lib/ui.js';

/** A05 (organiser) / B05 (invitee): preferences + your own, private budget. */
export async function preferencesScreen(me, { params }) {
  document.title = 'Your preferences · crew.com';
  const data = await api('GET', `/trips/${params.id}`);
  const isOrganiser = data.is_organiser;
  const saved = data.my_preferences;
  const err = errorBox();

  const state = {
    interests: new Set(saved?.interests ?? []),
    stays: new Set(saved?.stay_styles ?? []),
    vibe: saved?.vibe ?? 'balanced',
    budget: data.my_budget_minor != null ? data.my_budget_minor / 100 : BUDGET_SLIDER.default,
  };

  // ---- budget: slider + typed amount, kept in sync
  const readout = h('b', { style: 'color:var(--teal);font-size:16px;font-weight:800', 'aria-live': 'polite' });
  const range = h('input', { type: 'range', class: 'range', id: 'budget-range', ...BUDGET_SLIDER, 'aria-label': 'Your budget in rupees' });
  const typed = h('input', { id: 'budget', type: 'number', inputmode: 'numeric', min: 1, max: BUDGET_MAX, step: 100, 'aria-label': 'Budget amount in rupees' });
  const paintBudget = (fromTyped) => {
    const value = state.budget;
    readout.textContent = Number.isFinite(value) && value > 0 ? inrRupees(value) : '—';
    const clamped = Math.min(BUDGET_SLIDER.max, Math.max(BUDGET_SLIDER.min, value || BUDGET_SLIDER.min));
    range.value = String(clamped);
    range.style.setProperty('--fill', `${((clamped - BUDGET_SLIDER.min) / (BUDGET_SLIDER.max - BUDGET_SLIDER.min)) * 100}%`);
    if (!fromTyped) typed.value = String(value);
  };
  range.addEventListener('input', () => {
    state.budget = Number(range.value);
    paintBudget(false);
  });
  typed.addEventListener('input', () => {
    state.budget = typed.valueAsNumber;
    paintBudget(true);
  });
  paintBudget(false);

  // ---- toggle chips
  const chip = (label, set) => {
    const b = h('button', { type: 'button', class: `chip${set.has(label) ? ' sel' : ''}`, 'aria-pressed': String(set.has(label)) }, label);
    b.addEventListener('click', () => {
      set.has(label) ? set.delete(label) : set.add(label);
      b.classList.toggle('sel', set.has(label));
      b.setAttribute('aria-pressed', String(set.has(label)));
    });
    return b;
  };

  const vibeButtons = VIBES.map((v) =>
    h('button', { type: 'button', class: `vibe${state.vibe === v.value ? ' sel' : ''}`, 'aria-pressed': String(state.vibe === v.value), 'data-vibe': v.value }, h('b', {}, v.label), h('span', {}, v.hint)),
  );
  vibeButtons.forEach((b) =>
    b.addEventListener('click', () => {
      state.vibe = b.dataset.vibe;
      vibeButtons.forEach((x) => {
        const on = x === b;
        x.classList.toggle('sel', on);
        x.setAttribute('aria-pressed', String(on));
      });
    }),
  );

  const mustVisit = h('input', { id: 'must_visit', type: 'text', maxlength: 120, value: saved?.must_visit ?? '', placeholder: 'e.g. Dudhsagar Falls' });
  const submit = h('button', { class: 'cta', type: 'submit' }, isOrganiser ? 'Save & continue' : 'Save preferences', ' ', icon('arrow'));

  const form = h(
    'form',
    {
      class: 'sec',
      style: 'gap:13px',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.clear();
        if (!Number.isFinite(state.budget) || state.budget < 1 || state.budget > BUDGET_MAX) {
          err.show(`Enter a budget between ${inrRupees(1)} and ${inrRupees(BUDGET_MAX)}.`);
          typed.focus();
          return;
        }
        try {
          await busy(submit, 'Saving…', async () => {
            await api('PUT', `/trips/${params.id}/preferences`, {
              interests: [...state.interests],
              vibe: state.vibe,
              stay_styles: [...state.stays],
              must_visit: mustVisit.value.trim() || null,
            });
            await api('PUT', `/trips/${params.id}/budget`, { amount_rupees: state.budget });
          });
          navigate(isOrganiser ? `/trips/${params.id}/basics` : `/trips/${params.id}/waiting`);
        } catch (error) {
          err.show(error.message);
        }
      },
    },
    h('div', { class: 'sec' },
      h('div', { class: 'rowbet' }, h('label', { class: 'eyebrow', for: 'budget-range' }, 'Your budget'), readout),
      h('div', { class: 'card', style: 'padding:14px 16px' },
        range,
        h('div', { class: 'scale' }, h('span', {}, '₹2k'), h('span', {}, '₹25k')),
        h('div', { class: 'amount' }, h('label', { class: 'small', for: 'budget' }, 'Or type it'), h('div', { class: 'field' }, h('span', { class: 'prefix' }, '₹'), typed)),
        h('div', { class: 'small', style: 'font-size:9.5px;margin-top:8px' }, 'Private to you. The crew only ever sees the average of the budgets people share.'),
      ),
    ),
    h('div', { class: 'sec' }, h('span', { class: 'eyebrow' }, 'Into what?'), h('div', { class: 'card' }, h('div', { class: 'chips' }, INTERESTS.map((i) => chip(i, state.interests))))),
    h('div', { class: 'sec' }, h('span', { class: 'eyebrow' }, 'Trip vibe'), h('div', { class: 'vibes' }, vibeButtons)),
    h('div', { class: 'sec' }, h('span', { class: 'eyebrow' }, 'Stay style'), h('div', { class: 'chips' }, STAY_STYLES.map((s) => chip(s, state.stays)))),
    h('div', { class: 'sec' },
      h('label', { class: 'eyebrow', for: 'must_visit' }, "A place you don't want to miss (optional)"),
      h('div', { class: 'field' }, mustVisit),
      h('div', {}, h('span', { class: 'mini-sun' }, icon('sparkle'), ' Used when we plan your trip')),
    ),
    err.node,
    submit,
  );

  return screen(
    h('div', { class: 'step-head' },
      h('div', { class: 'top' }, !isOrganiser && backLink(`/trips/${params.id}`, 'Back to trip'), h('div', { class: 'step-av', 'aria-hidden': 'true' }, initial(me.display_name)), h('div', { class: 'eyebrow active' }, isOrganiser ? 'Step 1 of 3 · Your preferences' : 'Your preferences')),
      h('h1', {}, isOrganiser ? 'What do you want, ' : 'What are you into, ', h('em', {}, `${firstName(me.display_name)}?`)),
    ),
    form,
  );
}
