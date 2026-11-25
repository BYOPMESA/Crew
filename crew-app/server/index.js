import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createGateway } from './supabase.js';

loadEnvFile();

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Only ever report whether the key is present, never any part of it.
if (!config.serviceKey) {
  console.warn(
    'Invites DISABLED: this process has no SUPABASE_SERVICE_ROLE_KEY (checked the environment, then crew-app/.env). ' +
      'A key exported in a different terminal or app does not reach this process.',
  );
}

const app = createApp({ config, gateway: createGateway(config) });
const server = app.listen(config.port, () =>
  console.log(`crew.com listening on ${config.publicUrl} (port ${config.port}) | invites: ${config.serviceKey ? 'enabled' : 'DISABLED'}`),
);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use by another process, so THIS server did not start. Use a different PORT or stop the other one.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
