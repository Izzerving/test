import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DeletionInterval } from "@prisma/client";

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const deletionIntervalMap: Record<DeletionInterval, number> = {
  D1: 1,
  D5: 5,
  D10: 10,
  D30: 30,
  D90: 90,
  D180: 180,
  Y1: 365
};

export function generateOneTimeKey(length = 16) {
  const n = Math.max(10, Math.min(20, length));
  return Array.from({ length: n }, () => KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)]).join("");
}

export function buildDeleteAt(interval: DeletionInterval) {
  const now = new Date();
  now.setDate(now.getDate() + deletionIntervalMap[interval]);
  return now;
}

export function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function hashLookupSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(secret: string, encoded: string) {
  const [salt, storedHash] = encoded.split(":");
  const hashBuffer = Buffer.from(storedHash, "hex");
  const derived = scryptSync(secret, salt, 64);
  return timingSafeEqual(hashBuffer, derived);
}

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
