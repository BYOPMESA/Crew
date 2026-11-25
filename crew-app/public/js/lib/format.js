const inrFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Paise -> "₹8,000". */
export const inr = (minor) => `₹${inrFormat.format(Math.round(minor / 100))}`;
export const inrRupees = (rupees) => `₹${inrFormat.format(Math.round(rupees))}`;

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';
export const initial = (name = '') => (name.trim()[0] || '?').toUpperCase();

const words = (name) => (name ?? '').trim().split(/\s+/).filter(Boolean);

/**
 * Names that stay distinguishable inside one crew (issue #38: two people whose names start with the same
 * word must not both render as "QA" with the same one-letter avatar).
 * Returns Map(id -> { name, short, initials }):
 *   name     full name, with " (2)" etc. only when two people have the EXACT same full name
 *   short    first name; "First L." when another member shares the first name
 *   initials one letter; two letters (first + last initial) when another member shares the first name
 */
export function crewIdentity(people, idOf = (p) => p.user_id, nameOf = (p) => p.display_name) {
  const list = people.map((p) => ({ id: idOf(p), name: (nameOf(p) ?? '').trim() || 'Member' }));
  const tally = (key) => list.reduce((m, p) => m.set(key(p), (m.get(key(p)) ?? 0) + 1), new Map());
  const firstKey = (p) => (words(p.name)[0] ?? '').toLowerCase();
  const fullKey = (p) => p.name.toLowerCase();
  const sameFirst = tally(firstKey);
  const sameFull = tally(fullKey);
  const seenFull = new Map();

  const out = new Map();
  for (const p of list) {
    const w = words(p.name);
    const lastInitial = w.length > 1 ? w[w.length - 1][0].toUpperCase() : '';
    const clashes = sameFirst.get(firstKey(p)) > 1;

    let name = p.name;
    if (sameFull.get(fullKey(p)) > 1) {
      const n = (seenFull.get(fullKey(p)) ?? 0) + 1;
      seenFull.set(fullKey(p), n);
      if (n > 1) name = `${p.name} (${n})`;
    }
    out.set(p.id, {
      name,
      short: clashes && lastInitial ? `${w[0]} ${lastInitial}.` : w[0] ?? p.name,
      initials: clashes && lastInitial ? `${w[0][0].toUpperCase()}${lastInitial}` : (w[0]?.[0] ?? '?').toUpperCase(),
    });
  }
  return out;
}

const utc = (iso) => new Date(`${iso}T00:00:00Z`);
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function nights(start, end) {
  if (!start || !end) return null;
  const n = Math.round((utc(end) - utc(start)) / 86_400_000);
  return n >= 0 ? n : null;
}

export function dateRange(start, end) {
  if (!start && !end) return 'Dates not set';
  if (start && !end) return dayFmt.format(utc(start));
  if (!start) return `Until ${dayFmt.format(utc(end))}`;
  return `${dayFmt.format(utc(start))} – ${dayFmt.format(utc(end))}`;
}

export const STATUS_LABEL = { planning: 'Planning', voting: 'Voting open', closed: 'Voting closed' };
