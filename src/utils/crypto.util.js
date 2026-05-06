
import crypto from "crypto";

const ALGORITHM  = "aes-256-gcm";
const KEY_HEX    = process.env.ENCRYPTION_KEY || "";
const KEY_BUFFER = Buffer.from(KEY_HEX, "hex"); // must be 32 bytes

if (KEY_BUFFER.length !== 32) {
  throw new Error(
    "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
    "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// encrypt(plaintext) → "iv:authTag:ciphertext" (all hex)
// Returns null if value is null/undefined/empty
// ─────────────────────────────────────────────────────────────────────────────
export const encrypt = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value);
  const iv   = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
};

// ─────────────────────────────────────────────────────────────────────────────
// decrypt("iv:authTag:ciphertext") → plaintext string
// Returns null if value is null/undefined/empty
// ─────────────────────────────────────────────────────────────────────────────
export const decrypt = (value) => {
  if (value === null || value === undefined || value === "") return null;

  try {
    const [ivHex, authTagHex, encryptedHex] = String(value).split(":");

    if (!ivHex || !authTagHex || !encryptedHex) return null;

    const iv        = Buffer.from(ivHex, "hex");
    const authTag   = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null; // tampered or invalid — treat as null
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for objects — encrypt/decrypt only the specified fields
// ─────────────────────────────────────────────────────────────────────────────

export const encryptFields = (obj, fields) => {
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined) {
      out[field] = encrypt(out[field]);
    }
  }
  return out;
};

export const decryptFields = (obj, fields) => {
  if (!obj) return null;
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined) {
      out[field] = decrypt(out[field]);
    }
  }
  return out;
};