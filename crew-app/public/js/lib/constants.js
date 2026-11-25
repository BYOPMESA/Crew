// Mirrors server/schemas.js. The server validates everything again; these only drive the UI.
export const INTERESTS = ['Beaches', 'Nightlife', 'Water sports', 'Cafes', 'Treks', 'Seafood', 'Shopping', 'History'];
export const STAY_STYLES = ['Hostel', '3-star hotel', 'Villa', 'Resort'];
export const VIBES = [
  { value: 'chill', label: 'Chill', hint: 'slow mornings' },
  { value: 'balanced', label: 'Balanced', hint: 'bit of both' },
  { value: 'packed', label: 'Packed', hint: 'see everything' },
];
export const BUDGET_SLIDER = { min: 2000, max: 25000, step: 500, default: 8000 };
export const BUDGET_MAX = 10_000_000;
