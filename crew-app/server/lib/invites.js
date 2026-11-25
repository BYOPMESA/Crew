import { createHash, randomBytes } from 'node:crypto';

/** 24 random bytes = 192 bits of entropy, 32 URL-safe characters. Only the SHA-256 hash is stored. */
export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export const MAX_INVITES_PER_TRIP = 30;

/** valid | used | revoked | expired | invalid. Expiry is derived from expires_at, never trusted from status alone. */
export function inviteState(invitation, now = new Date()) {
  if (!invitation) return 'invalid';
  if (invitation.status === 'joined') return 'used';
  if (invitation.status === 'revoked') return 'revoked';
  if (new Date(invitation.expires_at) <= now) return 'expired';
  return 'valid';
}

export const INVITE_MESSAGES = {
  used: 'This invite link has already been used.',
  revoked: 'This invite link was replaced or cancelled. Ask your organiser for a new one.',
  expired: 'This invite link has expired. Ask your organiser for a new one.',
  invalid: 'This invite link is not valid. Check you copied the whole link, or ask for a new one.',
};
