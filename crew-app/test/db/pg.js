// A REAL Postgres (PGlite = Postgres compiled to WASM, in memory) running the project's ACTUAL migration files.
// Only the Supabase-provided pieces are stubbed: the three API roles and auth.users / auth.uid().
// RLS, grants, triggers and plpgsql run for real, so SQL behaviour here is not a mock.
// It is NOT your hosted Supabase project, so it complements (never replaces) the live two-account test.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  -- Supabase's auth.uid(): the signed-in user's id, taken from the request's JWT claims.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;

export async function freshDb({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (upTo && file > upTo) break;
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}

/** Create an auth user (the on_auth_user_created trigger then creates the profile). Returns the id. */
export async function addUser(db, name, email = `${name.toLowerCase().replace(/\W+/g, '.')}@example.test`) {
  const { rows } = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, JSON.stringify({ display_name: name })]);
  return rows[0].id;
}

/**
 * Run SQL the way the API does: as the `authenticated` role with the user's id in the JWT claims (so RLS and
 * auth.uid() apply), or as `anon` when userId is null. Each call is its own transaction.
 */
export function actAs(db, userId, role = userId ? 'authenticated' : 'anon') {
  const run = async (sql, params = []) =>
    db.transaction(async (tx) => {
      await tx.query(`set local role ${role}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
      return tx.query(sql, params);
    });
  return {
    run,
    /** rows, or throws the database error (so tests can assert on message/code) */
    rows: async (sql, params) => (await run(sql, params)).rows,
    /** { ok:true, rows } or { ok:false, message, code } - never throws */
    try: async (sql, params) => {
      try {
        return { ok: true, rows: (await run(sql, params)).rows };
      } catch (e) {
        return { ok: false, message: e.message, code: e.code };
      }
    },
  };
}

/** Run as the table owner (bypasses RLS): for arranging and inspecting test data only. */
export const admin = (db) => ({ rows: async (sql, params = []) => (await db.query(sql, params)).rows });
