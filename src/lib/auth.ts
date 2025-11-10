import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function randomPlaceholderPassword() {
  return randomBytes(SALT_LENGTH).toString('hex');
}

export function createRandomPasswordHash() {
  const placeholderPassword = randomPlaceholderPassword();
  return hashPassword(placeholderPassword);
}

export const generateRandomPasswordHash = createRandomPasswordHash;

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const hashBuffer = Buffer.from(originalHash, 'hex');
  const verifyBuffer = scryptSync(password, salt, KEY_LENGTH);

  if (hashBuffer.length !== verifyBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, verifyBuffer);
}

export function validateEmail(email: string) {
  return email.includes('@');
}

export function validatePassword(password: string) {
  return password.length >= 8;
}
