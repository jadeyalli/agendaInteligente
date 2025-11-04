import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_SIZE = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_SIZE);
  const hash = scryptSync(password, salt, KEY_LENGTH);

  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [saltHex, hashHex] = passwordHash.split(':');

  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const storedHash = Buffer.from(hashHex, 'hex');

  if (salt.length === 0 || storedHash.length === 0) {
    return false;
  }

  const computedHash = scryptSync(password, salt, storedHash.length);

  try {
    return timingSafeEqual(storedHash, computedHash);
  } catch {
    return false;
  }
}
