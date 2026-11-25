import { createApp } from '../server/app.js';

export const config = Object.freeze({
  port: 0,
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'test-anon',
  serviceKey: null,
  publicUrl: 'http://localhost',
  cookieSecure: false,
});

/**
 * Fake Supabase gateway. Pass overrides for the auth calls a test cares about;
 * `db` is the object returned by forUser(jwt).
 */
export function fakeGateway({ auth = {}, db = {}, admin = null, rpc = null } = {}) {
  // rpc(name, args, who) is a test script for the database functions; `who` is 'anon' or 'user' so a test can
  // assert WHICH client the server used. Unstubbed, it behaves like a project where the functions do not exist.
  const callRpc = (who) => async (name, args) => (rpc ? rpc(name, args, who) : { data: null, error: { code: 'PGRST202', message: 'function not found' } });
  return {
    anon: () => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'bad jwt' } }),
        refreshSession: async () => ({ data: { session: null }, error: { message: 'bad refresh' } }),
        signInWithPassword: async () => ({ data: {}, error: { code: 'invalid_credentials' } }),
        signUp: async () => ({ data: {}, error: { code: 'x' } }),
        ...auth,
      },
      rpc: callRpc('anon'),
    }),
    forUser: () => ({ ...db, rpc: callRpc('user') }),
    admin: () => {
      if (!admin) throw new Error('admin not available in tests');
      return admin;
    },
  };
}

export async function startServer(gateway, configOverrides = {}) {
  const app = createApp({ config: { ...config, ...configOverrides }, gateway });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (method, path, { body, headers = {} } = {}) =>
    fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { base, request, close: () => new Promise((r) => server.close(r)) };
}

export const AUTH_COOKIE = 'crew_at=good-token';
export const OTHER_COOKIE = 'crew_at=other-token';
export const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' };
export const USER2 = { id: '33333333-3333-4333-8333-333333333333', email: 'b@example.com' };
const tokens = { 'good-token': USER, 'other-token': USER2 };
export const goodAuth = {
  getUser: async (token) =>
    tokens[token] ? { data: { user: tokens[token] }, error: null } : { data: { user: null }, error: { message: 'x' } },
};
