import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Cifrado de las llaves de IA en la base (AES-256-GCM). La clave sale de
// AI_KEYS_SECRET o, si no existe, de JWT_SECRET: una copia de la base sola
// no basta para leer las llaves.
function secretKey(): Buffer {
  const secret = process.env.AI_KEYS_SECRET?.trim() || process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta AI_KEYS_SECRET o JWT_SECRET para cifrar las llaves de IA.');
  return createHash('sha256').update(`${secret}::ai-keys`).digest();
}

/** "iv.tag.cifrado" en base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** Últimos 4 caracteres, lo único que se muestra de una llave. */
export function lastFour(key: string): string {
  return key.slice(-4);
}
