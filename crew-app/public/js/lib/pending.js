// A half-finished join must survive sign-up (e.g. when email confirmation sends the person away).
// The link is single-use and expires in 7 days; it is cleared the moment it is used or found dead.
const KEY = 'crew_pending_invite';
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export function rememberPendingInvite(token) {
  try {
    if (TOKEN_RE.test(token)) localStorage.setItem(KEY, token);
  } catch {
    /* storage can be unavailable (private mode); the ?next= redirect still works */
  }
}

export function getPendingInvite() {
  try {
    const token = localStorage.getItem(KEY);
    return token && TOKEN_RE.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
