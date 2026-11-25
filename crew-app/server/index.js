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

if (!config.serviceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set: invite acceptance and background jobs are disabled.');
}

const app = createApp({ config, gateway: createGateway(config) });
app.listen(config.port, () => console.log(`crew.com listening on ${config.publicUrl} (port ${config.port})`));
