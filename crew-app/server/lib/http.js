import { ZodError } from 'zod';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse with a zod schema; on failure sends 400 and returns undefined. */
export function parse(schema, data, res) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  res.status(400).json({
    error: 'invalid_request',
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return undefined;
}

/** Map a PostgREST/Postgres error to a safe HTTP response (never leaks SQL details). */
export function sendDbError(res, error) {
  const code = error?.code;
  if (code === 'PGRST116') return res.status(404).json({ error: 'not_found' });
  if (code === '42501' || code === 'PGRST301') return res.status(403).json({ error: 'forbidden' });
  if (code === '23505') return res.status(409).json({ error: 'conflict' });
  if (['23514', '23502', '22P02', '23503', '22003'].includes(code)) {
    return res.status(400).json({ error: 'invalid_data' });
  }
  console.error('db_error', code ?? '', error?.message ?? '');
  return res.status(500).json({ error: 'server_error' });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_request' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  console.error('unhandled_error', err?.message ?? err);
  res.status(500).json({ error: 'server_error' });
}
