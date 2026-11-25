import { parseCookies } from '../lib/cookies.js';
import { wrap } from '../lib/http.js';

export const ACCESS_COOKIE = 'crew_at';
export const REFRESH_COOKIE = 'crew_rt';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Sessions live in HttpOnly cookies so page scripts (and any XSS) can never read the tokens. */
export function setSessionCookies(res, session, cfg) {
  const base = { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/' };
  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...base,
    maxAge: Math.max(60, session.expires_in ?? 3600) * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, { ...base, maxAge: THIRTY_DAYS_MS });
}

export function clearSessionCookies(res, cfg) {
  const base = { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/' };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

/**
 * Verifies the access token with Supabase Auth (not just decoding it), refreshing from the
 * refresh cookie when expired. Attaches req.user and req.db (a client acting as that user).
 */
export function requireAuth(gateway, cfg) {
  return wrap(async (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    let accessToken = cookies[ACCESS_COOKIE];
    let user = null;

    if (accessToken) {
      const { data, error } = await gateway.anon().auth.getUser(accessToken);
      if (!error && data?.user) user = data.user;
    }

    if (!user && cookies[REFRESH_COOKIE]) {
      const { data, error } = await gateway.anon().auth.refreshSession({
        refresh_token: cookies[REFRESH_COOKIE],
      });
      if (!error && data?.session?.user) {
        setSessionCookies(res, data.session, cfg);
        accessToken = data.session.access_token;
        user = data.session.user;
      }
    }

    if (!user) {
      clearSessionCookies(res, cfg);
      return res.status(401).json({ error: 'not_authenticated' });
    }

    req.user = { id: user.id, email: user.email };
    req.db = gateway.forUser(accessToken);
    next();
  });
}
