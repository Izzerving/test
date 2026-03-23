import { getRedis } from "@/lib/server/redis";

const PAYMENT_QUEUE_KEY = process.env.PAYMENT_QUEUE_KEY || "payments:jobs";
const PAYMENT_DLQ_KEY = process.env.PAYMENT_DLQ_KEY || "payments:dlq";

type PaymentQueuePayload = { paymentId: string; reason: string; ts: number; error?: string };

export async function enqueuePaymentJob(paymentId: string, reason = "scheduled") {
  await getRedis().lpush(PAYMENT_QUEUE_KEY, JSON.stringify({ paymentId, reason, ts: Date.now() } satisfies PaymentQueuePayload));
}

export async function enqueuePaymentDlq(paymentId: string, reason: string, error?: string) {
  const payload: PaymentQueuePayload = { paymentId, reason, ts: Date.now(), ...(error ? { error } : {}) };
  await getRedis().lpush(PAYMENT_DLQ_KEY, JSON.stringify(payload));
}

export async function popPaymentJob(timeoutSec = 2) {
  const result = await getRedis().brpop(PAYMENT_QUEUE_KEY, timeoutSec);
  if (!result) return null;

  const raw = result[1];
  try {
    return JSON.parse(raw) as PaymentQueuePayload;
  } catch {
    return null;
  }
}

export async function getPaymentQueueStats() {
  const redis = getRedis();
  const [depth, dlqDepth] = await Promise.all([redis.llen(PAYMENT_QUEUE_KEY), redis.llen(PAYMENT_DLQ_KEY)]);
  return { depth, dlqDepth };
}

export function paymentQueueKey() {
  return PAYMENT_QUEUE_KEY;
}

export function paymentDlqKey() {
  return PAYMENT_DLQ_KEY;
}
