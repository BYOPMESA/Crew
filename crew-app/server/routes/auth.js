import { Router } from 'express';
import { z } from 'zod';
import { parse, sendDbError, wrap } from '../lib/http.js';
import { createLimiter } from '../lib/ratelimit.js';
import { clearSessionCookies, requireAuth, setSessionCookies } from '../middleware/auth.js';

const email = z.string().trim().toLowerCase().email().max(254);
const signupSchema = z
  .object({
    email,
    password: z.string().min(8, 'Use at least 8 characters').max(72),
    display_name: z.string().trim().min(1, 'Enter your name').max(60),
  })
  .strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict();

export function authRoutes({ gateway, config }) {
  const router = Router();
  const loginLimiter = createLimiter({ windowMs: 15 * 60_000, max: 10 });
  const signupLimiter = createLimiter({ windowMs: 60 * 60_000, max: 10 });
  const tooMany = (res, retryAfterMs) =>
    res
      .set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
      .status(429)
      .json({ error: 'too_many_attempts', message: 'Too many attempts. Please try again later.' });

  router.post(
    '/signup',
    wrap(async (req, res) => {
      const limit = signupLimiter.hit(req.ip);
      if (!limit.ok) return tooMany(res, limit.retryAfterMs);

      const body = parse(signupSchema, req.body, res);
      if (!body) return;

      const { data, error } = await gateway.anon().auth.signUp({
        email: body.email,
        password: body.password,
        options: { data: { display_name: body.display_name } },
      });
      if (error) {
        const weak = error.code === 'weak_password';
        return res.status(400).json({
          error: weak ? 'weak_password' : 'signup_failed',
          message: weak ? 'That password is too weak.' : 'We could not create that account.',
        });
      }
      if (data.session) {
        setSessionCookies(res, data.session, config);
        return res.status(201).json({ needsConfirmation: false });
      }
      // Email confirmation is enabled in Supabase Auth: no session until the link is clicked.
      return res.status(202).json({ needsConfirmation: true });
    }),
  );

  router.post(
    '/login',
    wrap(async (req, res) => {
      const body = parse(loginSchema, req.body, res);
      if (!body) return;

      const key = `${req.ip}:${body.email}`;
      const limit = loginLimiter.hit(key);
      if (!limit.ok) return tooMany(res, limit.retryAfterMs);

      const { data, error } = await gateway.anon().auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      if (error || !data?.session) {
        if (error?.code === 'email_not_confirmed') {
          return res.status(403).json({
            error: 'email_not_confirmed',
            message: 'Please confirm your email first, then log in.',
          });
        }
        // One message for unknown email and wrong password: no account enumeration.
        return res
          .status(401)
          .json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
      }
      loginLimiter.reset(key);
      setSessionCookies(res, data.session, config);
      res.json({ ok: true });
    }),
  );

  router.post('/logout', (req, res) => {
    clearSessionCookies(res, config);
    res.json({ ok: true });
  });

  return router;
}

export function meRoute({ gateway, config }) {
  const router = Router();
  router.get(
    '/',
    requireAuth(gateway, config),
    wrap(async (req, res) => {
      const { data, error } = await req.db
        .from('profiles')
        .select('id, display_name')
        .eq('id', req.user.id)
        .single();
      if (error) return sendDbError(res, error);
      res.json({ id: data.id, display_name: data.display_name, email: req.user.email });
    }),
  );
  return router;
}
