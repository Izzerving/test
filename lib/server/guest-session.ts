import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "akm_guest_mailbox";
const DEFAULT_TTL_MINUTES = 30;

function secret() {
  return process.env.GUEST_COOKIE_SECRET || process.env.INGEST_API_KEY || "guest-fallback-secret";
}

function sign(raw: string) {
  return createHmac("sha256", secret()).update(raw).digest("hex");
}

export function guestCookieName() {
  return COOKIE_NAME;
}

export function buildGuestToken(mailboxId: string, ttlMinutes = DEFAULT_TTL_MINUTES) {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const raw = `${mailboxId}:${expiresAt}`;
  const mac = sign(raw);
  return `${raw}:${mac}`;
}

export function verifyGuestToken(token: string) {
  const [mailboxId, expiresAtRaw, mac] = token.split(":");
  if (!mailboxId || !expiresAtRaw || !mac) return null;

  const raw = `${mailboxId}:${expiresAtRaw}`;
  const expected = sign(raw);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(mac, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { mailboxId, expiresAt };
}
