// Vercel entry point. Vercel looks for index.js at the project root and runs the exported Express app as a
// serverless function (it never calls listen). Locally and on Render/Fly, `npm start` still runs server/index.js.
import { createApp } from './server/app.js';
import { loadConfig, loadEnvFile } from './server/config.js';
import { createGateway } from './server/supabase.js';

loadEnvFile(); // no-op on Vercel (no .env is deployed); real values come from the project's environment variables
const config = loadConfig(); // throws one clear error listing every missing variable

export default createApp({ config, gateway: createGateway(config) });
