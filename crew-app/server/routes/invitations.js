import { Router } from 'express';
import { z } from 'zod';
import { INVITE_MESSAGES, MAX_INVITES_PER_TRIP, TOKEN_RE, hashToken, inviteState, newToken } from '../lib/invites.js';
import { parse, sendDbError, wrap } from '../lib/http.js';
import { createLimiter } from '../lib/ratelimit.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { uuidParam } from '../schemas.js';

const createSchema = z.object({ invitee_name: z.string().trim().min(1, "Enter your friend's name").max(60) }).strict();

const PUBLIC_COLUMNS = 'id, invitee_name, status, email_status, expires_at, used_by, created_at';
const firstWord = (s = '') => s.trim().split(/\s+/)[0] || 'Someone';

/** Service-role client, or a 503 explaining invites are not configured on this server. */
function adminOr503(gateway, res) {
  try {
    return gateway.admin();
  } catch {
    res.status(503).json({ error: 'invites_unavailable', message: 'Invites are not set up on this server yet.' });
    return null;
  }
}

/** Organiser-only guard using the caller's own session (RLS), so non-organisers get a plain 404. */
async function organiserTrip(req, res) {
  const { data, error } = await req.db
    .from('trips')
    .select('id, name')
    .eq('id', req.params.id)
    .eq('organiser_id', req.user.id)
    .maybeSingle();
  if (error) {
    sendDbError(res, error);
    return null;
  }
  if (!data) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return data;
}

/** Mounted at /api/trips/:id/invitations (organiser creates/replaces/revokes; members list). */
export function tripInvitationRoutes({ gateway, config }) {
  const router = Router({ mergeParams: true });
  const createLimit = createLimiter({ windowMs: 60 * 60_000, max: 40 });
  router.use(requireAuth(gateway, config));
  router.use((req, res, next) => {
    if (!uuidParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'not_found' });
    next();
  });

  const linkFor = (token) => `${config.publicUrl}/join/${token}`;

  async function insertInvite(admin, { tripId, name, userId }) {
    const token = newToken();
    const { data, error } = await admin
      .from('invitations')
      .insert({ trip_id: tripId, invitee_name: name, token_hash: hashToken(token), created_by: userId })
      .select(PUBLIC_COLUMNS)
      .single();
    return { token, data, error };
  }

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
      const trip = await organiserTrip(req, res);
      if (!trip) return;
      if (!createLimit.hit(req.user.id).ok) return res.status(429).json({ error: 'too_many_attempts', message: 'Too many invites created. Try again later.' });
      const admin = adminOr503(gateway, res);
      if (!admin) return;

      const { count, error: countError } = await admin
        .from('invitations')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', trip.id)
        .neq('status', 'revoked');
      if (countError) return sendDbError(res, countError);
      if ((count ?? 0) >= MAX_INVITES_PER_TRIP) {
        return res.status(400).json({ error: 'too_many_invites', message: `A trip can have up to ${MAX_INVITES_PER_TRIP} invites.` });
      }

      const { token, data, error } = await insertInvite(admin, { tripId: trip.id, name: body.invitee_name, userId: req.user.id });
      if (error) return sendDbError(res, error);
      // The link is returned ONCE; only its hash is stored.
      res.status(201).json({ invitation: { ...data, state: inviteState(data) }, link: linkFor(token) });
    }),
  );

  const loadInvitation = async (req, res, admin) => {
    if (!uuidParam.safeParse(req.params.invId).success) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    const { data, error } = await admin
      .from('invitations')
      .select('id, trip_id, invitee_name, status, expires_at')
      .eq('id', req.params.invId)
      .eq('trip_id', req.params.id)
      .maybeSingle();
    if (error) {
      sendDbError(res, error);
      return null;
    }
    if (!data) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    if (data.status === 'joined') {
      res.status(409).json({ error: 'already_joined', message: `${data.invitee_name} has already joined with this invite.` });
      return null;
    }
    return data;
  };

  /** Atomic single-statement revoke: only a still-pending invite can be revoked. */
  const revoke = (admin, id) => admin.from('invitations').update({ status: 'revoked' }).eq('id', id).eq('status', 'pending').select('id');

  router.post(
    '/:invId/replace',
    wrap(async (req, res) => {
      const trip = await organiserTrip(req, res);
      if (!trip) return;
      const admin = adminOr503(gateway, res);
      if (!admin) return;
      const old = await loadInvitation(req, res, admin);
      if (!old) return;

      const { data: revoked, error: revokeError } = await revoke(admin, old.id);
      if (revokeError) return sendDbError(res, revokeError);
      if (old.status === 'pending' && !revoked?.length) return res.status(409).json({ error: 'already_joined' });

      const { token, data, error } = await insertInvite(admin, { tripId: trip.id, name: old.invitee_name, userId: req.user.id });
      if (error) return sendDbError(res, error);
      res.status(201).json({ invitation: { ...data, state: inviteState(data) }, link: linkFor(token) });
    }),
  );

  router.post(
    '/:invId/revoke',
    wrap(async (req, res) => {
      const trip = await organiserTrip(req, res);
      if (!trip) return;
      const admin = adminOr503(gateway, res);
      if (!admin) return;
      const inv = await loadInvitation(req, res, admin);
      if (!inv) return;
      const { error } = await revoke(admin, inv.id);
      if (error) return sendDbError(res, error);
      res.json({ ok: true });
    }),
  );

  return router;
}

/** Mounted at /api/invitations. Lookup is public (the landing page); accepting requires a session. */
export function publicInvitationRoutes({ gateway, config }) {
  const router = Router();
  const lookupLimit = createLimiter({ windowMs: 60_000, max: 60 });
  const acceptLimit = createLimiter({ windowMs: 60_000, max: 20 });

  const find = async (admin, token) => {
    if (!TOKEN_RE.test(token)) return { invitation: null };
    const { data, error } = await admin
      .from('invitations')
      .select('id, trip_id, invitee_name, status, expires_at, created_by')
      .eq('token_hash', hashToken(token))
      .maybeSingle();
    return { invitation: data ?? null, error };
  };

  router.get(
    '/:token',
    optionalAuth(gateway),
    wrap(async (req, res) => {
      if (!lookupLimit.hit(req.ip).ok) return res.status(429).json({ error: 'too_many_attempts' });
      const admin = adminOr503(gateway, res);
      if (!admin) return;
      const { invitation, error } = await find(admin, req.params.token);
      if (error) return sendDbError(res, error);

      const state = inviteState(invitation);
      if (state !== 'valid') {
        // Dead links reveal nothing about the trip.
        return res.json({ state, message: INVITE_MESSAGES[state] });
      }
      const [trip, organiser, members] = await Promise.all([
        admin.from('trips').select('name, destination, start_date, end_date').eq('id', invitation.trip_id).single(),
        admin.from('profiles').select('display_name').eq('id', invitation.created_by).single(),
        admin.from('trip_members').select('user_id', { count: 'exact', head: true }).eq('trip_id', invitation.trip_id),
      ]);
      for (const r of [trip, organiser, members]) if (r.error) return sendDbError(res, r.error);

      // A signed-in visitor who is already in this trip gets an "Open trip" state instead of "Join".
      let member = false;
      if (req.user) {
        const { data, error: memberError } = await admin
          .from('trip_members')
          .select('user_id')
          .eq('trip_id', invitation.trip_id)
          .eq('user_id', req.user.id)
          .maybeSingle();
        if (memberError) return sendDbError(res, memberError);
        member = !!data;
      }

      // Public landing shows only what the PRD allows: organiser, trip name, destination, dates, crew size.
      res.json({
        state: 'valid',
        invitee_name: invitation.invitee_name,
        organiser: firstWord(organiser.data.display_name),
        trip: trip.data,
        crew_in: members.count ?? 0,
        member,
        ...(member && { trip_id: invitation.trip_id }),
      });
    }),
  );

  router.post(
    '/:token/accept',
    requireAuth(gateway, config),
    wrap(async (req, res) => {
      if (!acceptLimit.hit(req.ip).ok) return res.status(429).json({ error: 'too_many_attempts' });
      const admin = adminOr503(gateway, res);
      if (!admin) return;
      const { invitation, error } = await find(admin, req.params.token);
      if (error) return sendDbError(res, error);
      if (!invitation) return res.status(410).json({ error: 'invite_invalid', message: INVITE_MESSAGES.invalid });

      // Existing members get "Open trip" and the invite is NOT consumed.
      const { data: existing, error: memberError } = await admin
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', invitation.trip_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (memberError) return sendDbError(res, memberError);
      if (existing) return res.json({ trip_id: invitation.trip_id, already_member: true });

      const state = inviteState(invitation);
      if (state !== 'valid') return res.status(410).json({ error: `invite_${state}`, message: INVITE_MESSAGES[state] });

      // Consume the link with ONE conditional statement so two people cannot both use it.
      const now = new Date().toISOString();
      const { data: consumed, error: consumeError } = await admin
        .from('invitations')
        .update({ status: 'joined', used_by: req.user.id, used_at: now })
        .eq('id', invitation.id)
        .eq('status', 'pending')
        .gt('expires_at', now)
        .select('id');
      if (consumeError) return sendDbError(res, consumeError);
      if (!consumed?.length) return res.status(410).json({ error: 'invite_used', message: INVITE_MESSAGES.used });

      const { error: insertError } = await admin
        .from('trip_members')
        .insert({ trip_id: invitation.trip_id, user_id: req.user.id, role: 'member' });
      if (insertError) {
        // Give the link back so the person can retry.
        await admin.from('invitations').update({ status: 'pending', used_by: null, used_at: null }).eq('id', invitation.id);
        return sendDbError(res, insertError);
      }
      res.json({ trip_id: invitation.trip_id, already_member: false });
    }),
  );

  return router;
}
