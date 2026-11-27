// Vercel Function entry. Vercel always turns files in api/ into serverless functions, whatever the project's
// framework preset is. vercel.json sends /api/* and /healthz here; Express then routes by the original URL.
export { default } from '../index.js';
