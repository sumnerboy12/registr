// Usage: npm run create-api-key -- <app> [label]
// Prints the plaintext key once — only its hash is stored, so save it now.
import db from './index.js';
import { generateApiKey, hashApiKey } from '../lib/apiKeys.js';

const [, , app, label] = process.argv;
const APPS = ['rostr', 'claimr', 'costr'];

if (!APPS.includes(app)) {
  console.error(`Usage: npm run create-api-key -- <${APPS.join('|')}> [label]`);
  process.exit(1);
}

const key = generateApiKey();
db.prepare('INSERT INTO api_keys (app, label, key_hash) VALUES (?, ?, ?)').run(app, label || null, hashApiKey(key));

console.log(`API key for ${app}:\n`);
console.log(key);
console.log(`\nStore this in ${app}'s server config now — it won't be shown again.`);
