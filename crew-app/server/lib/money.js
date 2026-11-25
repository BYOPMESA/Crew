// All money is stored and computed as integer paise ("minor units"). Never use floats for sums.

export function rupeesToMinor(rupees) {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees)) {
    throw new RangeError('amount must be a finite number');
  }
  return Math.round(rupees * 100);
}

export function minorToRupees(minor) {
  return minor / 100;
}

/**
 * Split `totalMinor` equally across participants. Remainder paise go to the first
 * participants in the order given, so shares always sum exactly to the total.
 */
export function splitEqual(totalMinor, userIds) {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new RangeError('total must be a non-negative integer (paise)');
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new RangeError('at least one participant is required');
  }
  if (new Set(userIds).size !== userIds.length) {
    throw new RangeError('participants must be unique');
  }
  const n = userIds.length;
  const base = Math.floor(totalMinor / n);
  const remainder = totalMinor - base * n;
  return userIds.map((user_id, i) => ({ user_id, share_minor: base + (i < remainder ? 1 : 0) }));
}
