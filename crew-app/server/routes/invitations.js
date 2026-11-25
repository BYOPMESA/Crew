import { Router } from 'express';
import { z } from 'zod';
import { INVITE_MESSAGES, TOKEN_RE, hashToken, inviteState, newToken } from '../lib/invites.js';
import { parse, sendDbError, wrap } from '../lib/http.js';
import { createLimiter } from '../lib/ratelimit.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { uuidParam } from '../schemas.js';

/**
 * Invitations run through database functions (supabase/migrations/*_invitation_functions.sql) called with the
 * CALLER'S OWN session. The database checks who is calling and performs each change in one transaction. This
 * server never holds a service-role key and never bypasses RLS for invitations: there is no admin client here.
 */

const createSchema = z.object({ invitee_name: z.string().trim().min(1, "Enter your friend's name").max(60) }).strict();

const PUBLIC_COLUMNS = 'id, invitee_name, status, email_status, expires_at, used_by, created_at';

// Stable error codes raised by the SQL functions -> HTTP responses.
const RPC_ERRORS = {
  not_authenticated: [401, 'not_authenticated', 'Please log in first.'],
  not_found: [404, 'not_found'],
  invalid_name: [400, 'invalid_name', "Enter your friend's name (up to 60 characters)."],
  too_many_invites: [400, 'too_many_invites', 'A trip can have up to 30 invites. Cancel one to add another.'],
  already_joined: [409, 'already_joined', 'That person has already joined with this invite.'],
  invite_used: [410, 'invite_used', INVITE_MESSAGES.used],
  invite_revoked: [410, 'invite_revoked', INVITE_MESSAGES.revoked],
  invite_expired: [410, 'invite_expired', INVITE_MESSAGES.expired],
  invite_invalid: [410, 'invite_invalid', INVITE_MESSAGES.invalid],
};

function sendRpcError(res, error) {
  const known = RPC_ERRORS[error?.message?.trim()];
  if (known) {
    const [status, code, message] = known;
    return res.status(status).json(message ? { error: code, message } : { error: code });
  }
  // The functions do not exist: the database migration has not been applied to this project yet.
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return res.status(503).json({ error: 'invites_unavailable', message: 'Invites need a database update that has not been applied yet.' });
  }
  return sendDbError(res, error);
}

const firstRow = (data) => (Array.isArray(data) ? data[0] : data);

/** Mounted at /api/trips/:id/invitations (organiser creates/replaces/revokes; members list). */
export function tripInvitationRoutes({ gateway, config }) {
  const router = Router({ mergeParams: true });
  const createLimit = createLimiter({ windowMs: 60 * 60_000, max: config.inviteRateLimit ?? 40 }); // per organiser, per hour
  router.use(requireAuth(gateway, config));
  router.use((req, res, next) => {
    if (!uuidParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'not_found' });
    next();
  });

  const linkFor = (token) => `${config.publicUrl}/join/${token}`;
  const issued = (res, row, token) => res.status(201).json({ invitation: { ...row, state: inviteState(row) }, link: linkFor(token) });

  router.get(
    '/',
    wrap(async (req, res) => {
      const { data, error } = await req.db
        .from('invitations')
        .select(PUBLIC_COLUMNS)
        .eq('trip_id', req.params.id)
        .neq('status', 'revoked')
        .order('created_at', { ascending: true });
      if (error) return sendDbError(res, error);
      res.json(data.map((i) => ({ ...i, state: inviteState(i) })));
    }),
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const body = parse(createSchema, req.body, res);
      if (!body) return;
      if (!createLimit.hit(req.user.id).ok) return res.status(429).json({ error: 'too_many_attempts', message: 'Too many invites created. Try again later.' });

      // The link is generated here and returned ONCE; only its SHA-256 hash is sent to (and stored by) the database.
      const token = newToken();
      const { data, error } = await req.db.rpc('create_invitation', { p_trip: req.params.id, p_invitee_name: body.invitee_name, p_token_hash: hashToken(token) });
      if (error) return sendRpcError(res, error);
      issued(res, firstRow(data), token);
    }),
  );

  const invitationId = (req, res, next) => {
    if (!uuidParam.safeParse(req.params.invId).success) return res.status(404).json({ error: 'not_found' });
    next();
  };

  router.post(
    '/:invId/replace',
    invitationId,
    wrap(async (req, res) => {
      const token = newToken();
      const { data, error } = await req.db.rpc('replace_invitation', { p_trip: req.params.id, p_invitation: req.params.invId, p_token_hash: hashToken(token) });
      if (error) return sendRpcError(res, error);
      issued(res, firstRow(data), token);
    }),
  );

  router.post(
    '/:invId/revoke',
    invitationId,
    wrap(async (req, res) => {
      const { error } = await req.db.rpc('revoke_invitation', { p_trip: req.params.id, p_invitation: req.params.invId });
      if (error) return sendRpcError(res, error);
      res.json({ ok: true });
    }),
  );

  return router;
}

/** Mounted at /api/invitations. The landing lookup works without a login; accepting requires a session. */
export function publicInvitationRoutes({ gateway, config }) {
  const router = Router();
  const lookupLimit = createLimiter({ windowMs: 60_000, max: 60 });
  const acceptLimit = createLimiter({ windowMs: 60_000, max: 20 });

  router.get(
    '/:token',
    optionalAuth(gateway),
    wrap(async (req, res) => {
      if (!lookupLimit.hit(req.ip).ok) return res.status(429).json({ error: 'too_many_attempts' });
      // A malformed link is answered without touching the database.
      if (!TOKEN_RE.test(req.params.token)) return res.json({ state: 'invalid', message: INVITE_MESSAGES.invalid });

      const { data, error } = await req.db.rpc('invitation_preview', { p_token_hash: hashToken(req.params.token) });
      if (error) return sendRpcError(res, error);
      const p = firstRow(data);
      if (!p || p.state !== 'valid') {
        // Dead links reveal nothing about the trip.
        const state = p?.state ?? 'invalid';
        return res.json({ state, message: INVITE_MESSAGES[state] ?? INVITE_MESSAGES.invalid });
      }
      // Only what the PRD allows on a public page: organiser first name, trip name, destination, dates, crew size.
      res.json({
        state: 'valid',
        invitee_name: p.invitee_name,
        organiser: p.organiser,
        trip: { name: p.trip_name, destination: p.destination, start_date: p.start_date, end_date: p.end_date },
        crew_in: p.crew_in ?? 0,
        member: Boolean(p.member),
        ...(p.member && { trip_id: p.trip_id }),
      });
    }),
  );

  router.post(
    '/:token/accept',
    requireAuth(gateway, config),
    wrap(async (req, res) => {
      if (!acceptLimit.hit(req.ip).ok) return res.status(429).json({ error: 'too_many_attempts' });
      if (!TOKEN_RE.test(req.params.token)) return res.status(410).json({ error: 'invite_invalid', message: INVITE_MESSAGES.invalid });

      const { data, error } = await req.db.rpc('accept_invitation', { p_token_hash: hashToken(req.params.token) });
      if (error) return sendRpcError(res, error);
      const row = firstRow(data);
      res.json({ trip_id: row.trip_id, already_member: Boolean(row.already_member) });
    }),
  );

  return router;
}
