import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { dataDir } from './db/index.js';

import authRouter from './routes/auth.js';
import peopleRouter from './routes/people.js';
import clientsRouter from './routes/clients.js';
import projectsRouter from './routes/projects.js';
import apiKeysRouter from './routes/apiKeys.js';
import emailRouter from './routes/email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4100;

// Persisted so sessions aren't all invalidated by a server restart.
const secretPath = path.join(dataDir, 'session-secret');
if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(32).toString('hex'));
const sessionSecret = fs.readFileSync(secretPath, 'utf8').trim();

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    name: 'registr.sid',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

app.use('/api/auth', authRouter);
app.use('/api/v1/people', peopleRouter);
app.use('/api/v1/clients', clientsRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/api-keys', apiKeysRouter);
app.use('/api/v1/email', emailRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, commit: process.env.GIT_COMMIT || null }));

// Serve the built client (production) if it exists, so the whole app can run
// from a single Node process on one machine.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`registr server listening on http://0.0.0.0:${PORT}`);
});
