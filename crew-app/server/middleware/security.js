const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // mockup markup uses inline style attributes
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(cfg) {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (cfg.cookieSecure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite=Lax cookies). */
export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const forbidden = () => res.status(403).json({ error: 'cross_site_request_blocked' });

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return forbidden();
    } catch {
      return forbidden();
    }
    return next();
  }
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return forbidden();
  next();
}

/** Request log that never prints query strings, headers or bodies (invite tokens, passwords). */
export function requestLog(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : '(static)';
    console.log(`${req.method} ${route} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
