const inrFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Paise -> "₹8,000". */
export const inr = (minor) => `₹${inrFormat.format(Math.round(minor / 100))}`;
export const inrRupees = (rupees) => `₹${inrFormat.format(Math.round(rupees))}`;

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';
export const initial = (name = '') => (name.trim()[0] || '?').toUpperCase();

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
