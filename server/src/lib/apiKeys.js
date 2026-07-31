import crypto from 'node:crypto';

// API keys are high-entropy random tokens, not user passwords, so a plain
// salted-free SHA-256 hash (compared in constant time) is standard practice
// here — unlike hashPassword's scrypt, there's no low-entropy input to
// defend against brute-forcing offline.
export function generateApiKey() {
  return `regk_${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function verifyApiKeyHash(key, hash) {
  const candidate = Buffer.from(hashApiKey(key), 'hex');
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}
