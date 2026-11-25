/**
 * Are the invitation database functions deployed and reachable? Asked of the database itself (with the anonymous
 * role and a deliberately malformed hash, so it reads nothing), and cached briefly so health checks stay cheap.
 * A server pointed at a project where the migration has not been applied reports invites:false instead of
 * looking healthy and then failing when someone clicks Invite.
 */
export function createInvitesProbe(gateway, { ttlMs = 30_000, now = () => Date.now() } = {}) {
  let cached = null;
  return async function invitesReady() {
    if (cached && now() - cached.at < ttlMs) return cached.ok;
    let ok = false;
    try {
      const { data, error } = await gateway.anon().rpc('invitation_preview', { p_token_hash: 'probe' });
      ok = !error && Array.isArray(data) && data[0]?.state === 'invalid';
    } catch {
      ok = false;
    }
    cached = { at: now(), ok };
    return ok;
  };
}
