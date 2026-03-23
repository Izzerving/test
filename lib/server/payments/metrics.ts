import { getRedis } from "@/lib/server/redis";

const METRICS_KEY = process.env.PAYMENT_METRICS_KEY || "payments:metrics";

export async function markPaymentCreated() {
  await getRedis().hincrby(METRICS_KEY, "created_total", 1);
}

export async function markPaymentConfirmed(durationMs: number) {
  const redis = getRedis();
  await redis.multi().hincrby(METRICS_KEY, "confirmed_total", 1).hincrbyfloat(METRICS_KEY, "confirm_duration_ms_sum", durationMs).exec();
}

export async function markPaymentRetryEnqueued() {
  await getRedis().hincrby(METRICS_KEY, "retry_enqueued_total", 1);
}

export async function markPaymentDlq() {
  await getRedis().hincrby(METRICS_KEY, "dlq_total", 1);
}

export async function getPaymentSlaMetrics() {
  const values = await getRedis().hgetall(METRICS_KEY);

  const createdTotal = Number(values.created_total || 0);
  const confirmedTotal = Number(values.confirmed_total || 0);
  const retryEnqueuedTotal = Number(values.retry_enqueued_total || 0);
  const dlqTotal = Number(values.dlq_total || 0);
  const durationMsSum = Number(values.confirm_duration_ms_sum || 0);

  return {
    createdTotal,
    confirmedTotal,
    retryEnqueuedTotal,
    dlqTotal,
    avgConfirmationMs: confirmedTotal > 0 ? Math.round(durationMsSum / confirmedTotal) : 0,
    confirmationRate: createdTotal > 0 ? Number((confirmedTotal / createdTotal).toFixed(4)) : 0
  };
}
