// Lets the REAL Express app run against the REAL Postgres engine (PGlite) with the real migrations:
// HTTP request -> routes -> supabase-js-shaped client -> SQL functions + RLS, as the right role with the right JWT claims.
// Only Supabase Auth (token -> user) and the PostgREST transport are simulated. admin() throws on purpose, so any
// code path that needs the service-role key fails loudly here instead of working by accident.
import { actAs } from './pg.js';

const wrapJson = (inner) => `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from (${inner}) r`;
const asError = (e) => ({ data: null, error: { message: e.message, code: e.code } });

function client(db, userId, calls) {
  const act = actAs(db, userId);

  const rpc = async (fn, args = {}) => {
    const keys = Object.keys(args);
    calls?.push({ kind: 'rpc', fn, as: userId ? 'user' : 'anon' });
    const named = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    try {
      const { rows } = await act.run(wrapJson(`select * from public.${fn}(${named})`), keys.map((k) => args[k]));
      return { data: rows[0].j, error: null };
    } catch (e) {
      return asError(e);
    }
  };

  // Just enough of the query builder for the routes under test.
  const from = (table) => {
    const q = { cols: '*', where: [], params: [], order: '', mode: 'many' };
    const b = {
      select(cols = '*') { q.cols = cols; return b; },
      eq(k, v) { q.params.push(v); q.where.push(`${k} = $${q.params.length}`); return b; },
      neq(k, v) { q.params.push(v); q.where.push(`${k} <> $${q.params.length}`); return b; },
      order(k, { ascending = true } = {}) { q.order = ` order by ${k} ${ascending ? 'asc' : 'desc'}`; return b; },
      limit() { return b; },
      single() { q.mode = 'single'; return b; },
      maybeSingle() { q.mode = 'maybe'; return b; },
      then(resolve, reject) {
        return (async () => {
          calls?.push({ kind: 'from', table, as: userId ? 'user' : 'anon' });
          try {
            const where = q.where.length ? ` where ${q.where.join(' and ')}` : '';
            const { rows } = await act.run(wrapJson(`select ${q.cols} from public.${table}${where}${q.order}`), q.params);
            const data = rows[0].j;
            if (q.mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
            if (q.mode === 'maybe') return { data: data[0] ?? null, error: null };
            return { data, error: null };
          } catch (e) {
            return asError(e);
          }
        })().then(resolve, reject);
      },
    };
    return b;
  };

  return { rpc, from };
}

/**
 * @param db     a PGlite database (see freshDb)
 * @param tokens Map of session token -> { id, email } (stands in for Supabase Auth)
 */
export function pgliteGateway(db, tokens) {
  const calls = [];
  const userOf = (jwt) => tokens.get(jwt)?.id ?? null;
  return {
    calls,
    anon: () => ({
      ...client(db, null, calls),
      auth: {
        getUser: async (jwt) => (tokens.has(jwt) ? { data: { user: tokens.get(jwt) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }),
        refreshSession: async () => ({ data: { session: null }, error: { message: 'no session' } }),
      },
    }),
    forUser: (jwt) => client(db, userOf(jwt), calls),
    admin: () => {
      calls.push({ kind: 'admin' });
      throw new Error('the service-role client must not be needed for invitations');
    },
  };
}
