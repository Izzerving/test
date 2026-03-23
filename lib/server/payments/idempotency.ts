import { createHash } from "crypto";

export function buildIdempotencyKey(userId: string, method: string, amountUsd: number, currency: string) {
  return createHash("sha256")
    .update(`${userId}:${method}:${amountUsd.toFixed(2)}:${currency.toUpperCase()}`)
    .digest("hex");
}
