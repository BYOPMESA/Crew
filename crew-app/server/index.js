import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createInvitesProbe } from './lib/health.js';
import { createGateway } from './supabase.js';

loadEnvFile();

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Invitations use database functions with each caller's own session: no service-role key is needed or used.
const gateway = createGateway(config);
const app = createApp({ config, gateway });
const server = app.listen(config.port, () => {
  console.log(`crew.com listening on ${config.publicUrl} (port ${config.port})`);
  // Say up front whether the invitation functions are deployed, instead of failing when someone clicks Invite.
  createInvitesProbe(gateway)()
    .then((ok) => console.log(ok ? 'invites: ready (database functions found)' : 'invites: NOT READY - the invitation database migration has not been applied to this project'))
    .catch(() => console.log('invites: could not be checked (database unreachable?)'));
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use by another process, so THIS server did not start. Use a different PORT or stop the other one.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
