import { createClient } from '@supabase/supabase-js';

/**
 * Factory for Supabase clients. A NEW client is created per call on purpose:
 * clients hold in-memory session state, and sharing one across requests would mix users up.
 *  - anon():      for sign-up / sign-in / token verification
 *  - forUser(jwt): acts as the signed-in user, so Row Level Security applies
 *  - admin():     service role (bypasses RLS). Server-only; used for invite acceptance and jobs.
 */
export function createGateway(cfg) {
  const base = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return {
    anon: () => createClient(cfg.supabaseUrl, cfg.anonKey, base),
    forUser: (jwt) =>
      createClient(cfg.supabaseUrl, cfg.anonKey, {
        ...base,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      }),
    admin: () => {
      if (!cfg.serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
      return createClient(cfg.supabaseUrl, cfg.serviceKey, base);
    },
  };
}
