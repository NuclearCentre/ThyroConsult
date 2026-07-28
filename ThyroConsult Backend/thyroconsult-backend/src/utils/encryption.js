const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = parseInt(process.env.ENCRYPTION_IV_LENGTH) || 16;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from a hex string environment variable
 */
const getKey = (keyHex) => {
  if (!keyHex || keyHex.length < 64) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
};

/**
 * Encrypt a string value using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all hex, colon-separated)
 */
const encrypt = (plaintext, keyEnvVar = 'ENCRYPTION_KEY') => {
  if (plaintext === null || plaintext === undefined) return null;
  try {
    const key = getKey(process.env[keyEnvVar]);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([
      cipher.update(String(plaintext), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (err) {
    throw new Error(`Encryption failed: ${err.message}`);
  }
};

/**
 * Decrypt a value encrypted with encrypt()
 */
const decrypt = (ciphertext, keyEnvVar = 'ENCRYPTION_KEY') => {
  if (ciphertext === null || ciphertext === undefined) return null;
  try {
    const key = getKey(process.env[keyEnvVar]);
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid ciphertext format');
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
};

/**
 * Encrypt PHI fields (uses separate PHI key)
 */
const encryptPHI = (value) => encrypt(value, 'PHI_ENCRYPTION_KEY');
const decryptPHI = (value) => decrypt(value, 'PHI_ENCRYPTION_KEY');

/**
 * Encrypt patient photo (uses isolated photo vault key)
 */
const encryptPhoto = (buffer) => {
  if (!buffer) return null;
  const key = getKey(process.env.PHOTO_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('base64'),
  };
};

const decryptPhoto = (encryptedObj) => {
  if (!encryptedObj) return null;
  const key = getKey(process.env.PHOTO_ENCRYPTION_KEY);
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const authTag = Buffer.from(encryptedObj.authTag, 'hex');
  const data = Buffer.from(encryptedObj.data, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

/**
 * Generate a secure HMAC-SHA256 hash for searchable encrypted fields
 * (allows lookup without decrypting — e.g. find patient by mobile hash)
 */
const hmacHash = (value, keyEnvVar = 'ENCRYPTION_KEY') => {
  if (!value) return null;
  const key = getKey(process.env[keyEnvVar]);
  return crypto.createHmac('sha256', key).update(String(value).toLowerCase().trim()).digest('hex');
};

/**
 * Generate a cryptographically secure random token
 */
const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/**
 * Generate a numeric OTP
 */
const generateOTP = (length = 6) => {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const range = max - min;
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  return String(min + (randomValue % range));
};

/**
 * Hash a file buffer for integrity verification
 */
const hashFile = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Constant-time string comparison to prevent timing attacks
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

module.exports = {
  encrypt,
  decrypt,
  encryptPHI,
  decryptPHI,
  encryptPhoto,
  decryptPhoto,
  hmacHash,
  generateToken,
  generateOTP,
  hashFile,
  safeCompare,
};
