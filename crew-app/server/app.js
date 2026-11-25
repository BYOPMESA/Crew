import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createInvitesProbe } from './lib/health.js';
import { errorHandler, wrap } from './lib/http.js';
import { requestLog, sameOriginWrites, securityHeaders } from './middleware/security.js';
import { authRoutes, meRoute } from './routes/auth.js';
import { publicInvitationRoutes, tripInvitationRoutes } from './routes/invitations.js';
import { tripRoutes } from './routes/trips.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp({ config, gateway }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Fly proxy: correct client IP for rate limits
  app.use(requestLog);
  app.use(securityHeaders(config));
  app.use(express.json({ limit: '50kb' }));
  app.use(sameOriginWrites);

  // `invites` is a plain yes/no: are the invitation database functions deployed and reachable? It reveals nothing
  // else, and it makes a project with the migration missing obvious instead of failing only when someone clicks Invite.
  const invitesReady = createInvitesProbe(gateway);
  app.get('/healthz', wrap(async (req, res) => res.json({ ok: true, invites: await invitesReady() })));

  const deps = { gateway, config };
  app.use('/api/auth', authRoutes(deps));
  app.use('/api/me', meRoute(deps));
  app.use('/api/trips/:id/invitations', tripInvitationRoutes(deps));
  app.use('/api/trips', tripRoutes(deps));
  app.use('/api/invitations', publicInvitationRoutes(deps));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Code (js/css/html) revalidates on every load so a deploy is picked up immediately (the files are not
  // fingerprinted); fonts and photos never change in place, so they can be cached for a day.
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', /\.(js|css|html)$/.test(filePath) ? 'no-cache' : 'public, max-age=86400');
      },
    }),
  );
  // Single-page app: any other GET serves the shell; the client router takes over.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}
