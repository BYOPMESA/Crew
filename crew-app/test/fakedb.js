/**
 * Minimal in-memory stand-in for the Supabase query builder: just enough surface for the routes under test.
 * It honours select() column lists, so a test can prove a column (e.g. token_hash) is never returned.
 * It does NOT simulate RLS: authorization is covered by the live tests against the real database.
 */
export function makeDb(seed = {}, { unique = {} } = {}) {
  const tables = {};
  for (const [name, list] of Object.entries(seed)) tables[name] = list.map((r) => ({ ...r }));
  let seq = 0;

  const project = (row, cols) => {
    if (!cols || cols === '*') return { ...row };
    const out = {};
    for (const c of cols.split(',').map((s) => s.trim())) if (c in row) out[c] = row[c];
    return out;
  };

  const from = (table) => {
    tables[table] ??= [];
    const q = { op: 'select', filters: [], cols: '*', opts: {}, mode: 'many', returning: false, order: null };
    const b = {
      select(cols = '*', opts = {}) {
        q.cols = cols;
        q.opts = opts;
        if (q.op !== 'select') q.returning = true;
        return b;
      },
      insert(payload) {
        q.op = 'insert';
        q.payload = payload;
        return b;
      },
      update(patch) {
        q.op = 'update';
        q.patch = patch;
        return b;
      },
      eq(k, v) {
        q.filters.push((r) => r[k] === v);
        return b;
      },
      neq(k, v) {
        q.filters.push((r) => r[k] !== v);
        return b;
      },
      gt(k, v) {
        q.filters.push((r) => r[k] > v);
        return b;
      },
      order(k, { ascending = true } = {}) {
        q.order = [k, ascending];
        return b;
      },
      limit: () => b,
      single() {
        q.mode = 'single';
        return b;
      },
      maybeSingle() {
        q.mode = 'maybe';
        return b;
      },
      then(resolve, reject) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };

    function finish(list) {
      if (q.opts.head) return { data: null, error: null, count: list.length };
      if (q.op !== 'select' && !q.returning) return { data: null, error: null };
      const rows = list.map((r) => project(r, q.cols));
      if (q.mode === 'single') {
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      if (q.mode === 'maybe') return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null, count: rows.length };
    }

    function run() {
      const all = tables[table];
      if (q.op === 'insert') {
        const made = [];
        for (const p of Array.isArray(q.payload) ? q.payload : [q.payload]) {
          const row = {
            id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
            status: table === 'invitations' ? 'pending' : undefined,
            created_at: new Date().toISOString(),
            expires_at: table === 'invitations' ? new Date(Date.now() + 7 * 864e5).toISOString() : undefined,
            ...p,
          };
          const keys = unique[table];
          if (keys && all.some((r) => keys.every((k) => r[k] === row[k]))) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          made.push(row);
        }
        all.push(...made);
        return finish(made);
      }
      let hit = all.filter((r) => q.filters.every((f) => f(r)));
      if (q.op === 'update') for (const r of hit) Object.assign(r, q.patch);
      if (q.order) hit = [...hit].sort((a, z) => (a[q.order[0]] > z[q.order[0]] ? 1 : -1) * (q.order[1] ? 1 : -1));
      return finish(hit);
    }
    return b;
  };

  return { from, tables };
}
