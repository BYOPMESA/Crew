import { Router } from 'express';
import { parse, sendDbError, wrap } from '../lib/http.js';
import { rupeesToMinor } from '../lib/money.js';
import { requireAuth } from '../middleware/auth.js';
import {
  budgetSchema,
  createTripSchema,
  preferencesSchema,
  tripBasicsSchema,
  uuidParam,
} from '../schemas.js';

const TRIP_COLUMNS =
  'id, name, crew_name, destination, start_date, end_date, expected_size, notes, status, organiser_id, created_at';

export function tripRoutes({ gateway, config }) {
  const router = Router();
  router.use(requireAuth(gateway, config));

  // Validate :id once for every route that has it.
  router.param('id', (req, res, next, id) => {
    if (!uuidParam.safeParse(id).success) return res.status(404).json({ error: 'not_found' });
    next();
  });

  router.get(
    '/',
    wrap(async (req, res) => {
      const { data, error } = await req.db
        .from('trips')
        .select(`${TRIP_COLUMNS}, trip_members(count)`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return sendDbError(res, error);
      res.json(
        data.map(({ trip_members, ...trip }) => ({ ...trip, member_count: trip_members?.[0]?.count ?? 1 })),
      );
    }),
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const body = parse(createTripSchema, req.body ?? {}, res);
      if (!body) return;
      const { data, error } = await req.db
        .from('trips')
        .insert({ organiser_id: req.user.id, name: body.name ?? 'Our trip' })
        .select(TRIP_COLUMNS)
        .single();
      if (error) return sendDbError(res, error);
      res.status(201).json(data);
    }),
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const { id } = req.params;
      const { data: trip, error } = await req.db.from('trips').select(TRIP_COLUMNS).eq('id', id).single();
      if (error) return sendDbError(res, error); // RLS hides other people's trips: 404

      const [progress, budget, prefs, mine] = await Promise.all([
        req.db.rpc('trip_progress', { p_trip: id }),
        req.db.rpc('crew_budget', { p_trip: id }),
        req.db
          .from('preferences')
          .select('interests, vibe, stay_styles, must_visit')
          .eq('trip_id', id)
          .eq('user_id', req.user.id)
          .maybeSingle(),
        req.db
          .from('member_budgets')
          .select('amount_minor')
          .eq('trip_id', id)
          .eq('user_id', req.user.id)
          .maybeSingle(),
      ]);
      for (const r of [progress, budget, prefs, mine]) if (r.error) return sendDbError(res, r.error);

      const b = budget.data?.[0] ?? { average_minor: null, submitted: 0, expected: trip.expected_size };
      res.json({
        trip,
        is_organiser: trip.organiser_id === req.user.id,
        members: progress.data,
        crew_budget: { average_minor: b.average_minor, submitted: b.submitted, expected: b.expected },
        my_preferences: prefs.data,
        my_budget_minor: mine.data?.amount_minor ?? null,
      });
    }),
  );

  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const body = parse(tripBasicsSchema, req.body, res);
      if (!body) return;
      const { data, error } = await req.db
        .from('trips')
        .update(body)
        .eq('id', req.params.id)
        .select(TRIP_COLUMNS);
      if (error) return sendDbError(res, error);
      // No row back means RLS hid it (not a member) or the caller is not the organiser.
      if (!data?.length) return res.status(404).json({ error: 'not_found' });
      res.json(data[0]);
    }),
  );

  router.put(
    '/:id/preferences',
    wrap(async (req, res) => {
      const body = parse(preferencesSchema, req.body, res);
      if (!body) return;
      const { error } = await req.db
        .from('preferences')
        .upsert(
          { trip_id: req.params.id, user_id: req.user.id, ...body, updated_at: new Date().toISOString() },
          { onConflict: 'trip_id,user_id' },
        );
      if (error) return sendDbError(res, error);
      res.json({ ok: true });
    }),
  );

  router.put(
    '/:id/budget',
    wrap(async (req, res) => {
      const body = parse(budgetSchema, req.body, res);
      if (!body) return;
      const { error } = await req.db.from('member_budgets').upsert(
        {
          trip_id: req.params.id,
          user_id: req.user.id,
          amount_minor: rupeesToMinor(body.amount_rupees),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'trip_id,user_id' },
      );
      if (error) return sendDbError(res, error);
      res.json({ ok: true });
    }),
  );

  return router;
}
