import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Load .env into process.env if present (Node built-in; no dotenv dependency). */
export function loadEnvFile(file = path.join(root, '.env')) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * Validate configuration and return a frozen config object.
 * Throws one error listing every problem so a bad deploy fails loudly at startup.
 */
export function loadConfig(env = process.env) {
  const errors = [];
  const required = (key) => {
    const value = env[key]?.trim();
    if (!value) errors.push(`${key} is required`);
    return value;
  };

  const supabaseUrl = required('SUPABASE_URL');
  const anonKey = required('SUPABASE_ANON_KEY');
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      if (u.protocol !== 'https:') errors.push('SUPABASE_URL must be an https URL');
    } catch {
      errors.push('SUPABASE_URL is not a valid URL');
    }
  }

  const port = Number(env.PORT ?? 3003);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be 1-65535');

  const publicUrl = (env.CREW_PUBLIC_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, '');
  try {
    new URL(publicUrl);
  } catch {
    errors.push('CREW_PUBLIC_URL is not a valid URL');
  }

  const cookieSecure = env.COOKIE_SECURE === '1';
  if (cookieSecure && !publicUrl.startsWith('https://')) {
    errors.push('COOKIE_SECURE=1 requires CREW_PUBLIC_URL to be https');
  }

  if (errors.length) {
    throw new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  }

  return Object.freeze({
    port,
    supabaseUrl,
    anonKey,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    publicUrl,
    cookieSecure,
  });
}
