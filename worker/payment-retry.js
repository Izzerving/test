/**
 * Payment retry worker.
 * - consumes durable Redis queue first
 * - falls back to DB claim/lock scan
 * - bounded retry backoff + queue re-enqueue
 * - DLQ routing for malformed and terminal retry jobs
 */
const { PrismaClient, PaymentStatus } = require('@prisma/client');
const { randomUUID } = require('crypto');
const Redis = require('ioredis');
const { createLogger, captureException, getErrorMessage, installGlobalErrorHandlers } = require('../lib/server/observability');

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const queueKey = process.env.PAYMENT_QUEUE_KEY || 'payments:jobs';
const dlqKey = process.env.PAYMENT_DLQ_KEY || 'payments:dlq';
const metricsKey = process.env.PAYMENT_METRICS_KEY || 'payments:metrics';
const maxRetries = Number(process.env.PAYMENT_MAX_RETRIES || 12);
const logger = createLogger('worker.payment-retry');
installGlobalErrorHandlers();

async function toDlq(payload, errorMessage) {
  await redis.lpush(dlqKey, JSON.stringify({ ...payload, error: errorMessage, dlqAt: Date.now() }));
  await redis.hincrby(metricsKey, 'dlq_total', 1);
}

async function applyConfirmedReferralBonus(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { id: true, referredById: true } },
      referralBonus: { select: { id: true } }
    }
  });

  if (!payment || payment.status !== PaymentStatus.CONFIRMED || !payment.user.referredById || payment.referralBonus) {
    return false;
  }

  const amountUsd = (Number(payment.amountUsd) * 0.1).toFixed(2);
  if (Number(amountUsd) <= 0) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    const lockedPayment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { referralBonus: { select: { id: true } }, user: { select: { id: true, referredById: true } } }
    });

    if (!lockedPayment || lockedPayment.referralBonus || !lockedPayment.user.referredById) {
      return;
    }

    await tx.referralBonus.create({
      data: {
        referrerId: lockedPayment.user.referredById,
        referredId: lockedPayment.user.id,
        type: 'PAYMENT',
        amountUsd,
        fromPaymentId: lockedPayment.id
      }
    });

    await tx.user.update({
      where: { id: lockedPayment.user.referredById },
      data: { referralBalance: { increment: amountUsd } }
    });
  });

  return true;
}

async function claimJobs(lockId, limit = 50) {
  const now = new Date();
  const lockUntil = new Date(Date.now() + 60_000);

  const candidates = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PENDING,
      nextRetryAt: { lte: now },
      OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }]
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true }
  });

  for (const c of candidates) {
    await prisma.payment.updateMany({
      where: { id: c.id, OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }] },
      data: { processingLock: lockId, lockExpiresAt: lockUntil }
    });
  }

  return prisma.payment.findMany({ where: { processingLock: lockId, lockExpiresAt: { gte: now } }, take: limit });
}

async function processPayment(payment, reason = 'retry') {
  if (payment.status === PaymentStatus.CONFIRMED) {
    await applyConfirmedReferralBonus(payment.id);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { processingLock: null, lockExpiresAt: null }
    }).catch(() => null);
    return;
  }

  if (payment.status !== PaymentStatus.PENDING) return;

  if (payment.retryCount >= maxRetries) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { processingLock: null, lockExpiresAt: null }
    });
    await toDlq({ paymentId: payment.id, reason }, 'max_retries_exceeded');
    return;
  }

  const nextRetryMinutes = Math.min(60, 5 * (payment.retryCount + 1));
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      retryCount: { increment: 1 },
      nextRetryAt: new Date(Date.now() + nextRetryMinutes * 60 * 1000),
      processingLock: null,
      lockExpiresAt: null
    }
  });

  await redis.lpush(queueKey, JSON.stringify({ paymentId: payment.id, reason: `${reason}_requeue`, ts: Date.now() }));
  await redis.hincrby(metricsKey, 'retry_enqueued_total', 1);
}

async function tryQueueOnce() {
  const payload = await redis.brpop(queueKey, 2);
  if (!payload) return false;

  try {
    const parsed = JSON.parse(payload[1]);
    if (!parsed.paymentId) {
      await toDlq({ raw: payload[1], reason: 'invalid_payload' }, 'missing_payment_id');
      return true;
    }

    const payment = await prisma.payment.findUnique({ where: { id: parsed.paymentId } });
    if (!payment) {
      await toDlq(parsed, 'payment_not_found');
      return true;
    }

    await processPayment(payment, parsed.reason || 'queued');
    return true;
  } catch (e) {
    await captureException(e, { worker: 'payment-retry', phase: 'queue_parse' });
    logger.error('payment-retry.queue_parse_error', { message: getErrorMessage(e) });
    await toDlq({ raw: payload[1], reason: 'parse_error' }, String(e?.message || 'unknown_error'));
    return true;
  }
}

async function tick() {
  const queueWorked = await tryQueueOnce();
  if (queueWorked) {
    logger.info('payment-retry.queue_processed');
    return;
  }

  const lockId = randomUUID();
  const jobs = await claimJobs(lockId);
  for (const p of jobs) {
    await processPayment(p, 'scan');
  }

  logger.info('payment-retry.tick_claimed', { claimed: jobs.length });
}

setInterval(() => {
  tick().catch(async (e) => {
    await captureException(e, { worker: 'payment-retry', phase: 'tick' });
    logger.error('payment-retry.tick_error', { message: getErrorMessage(e) });
  });
}, 10_000);
