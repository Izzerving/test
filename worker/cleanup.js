const { PrismaClient } = require("@prisma/client");
const { createLogger, captureException, getErrorMessage, installGlobalErrorHandlers } = require("../lib/server/observability");

const cleanupPrisma = new PrismaClient();
const logger = createLogger("worker.cleanup-cron");
installGlobalErrorHandlers();
const cleanupIntervalMs = Number(process.env.CLEANUP_INTERVAL_MS || 10 * 60 * 1000);
const softDeleteHoldMs = 30 * 24 * 60 * 60 * 1000;
const staleSessionMaxAgeMs = Number(process.env.CLEANUP_SESSION_MAX_AGE_MS || 30 * 24 * 60 * 60 * 1000);
const userBatchSize = Number(process.env.CLEANUP_USER_BATCH_SIZE || 200);

let cleanupInProgress = false;
let stopRequested = false;
let cleanupIntervalHandle;

async function archiveExpiredMailboxes(now) {
  return cleanupPrisma.$transaction(async (tx) => {
    const archived = await tx.mailbox.updateMany({
      where: { isActive: true, expiresAt: { lte: now } },
      data: { isActive: false }
    });
    return archived.count;
  });
}

async function hardDeleteUsers(where, reason) {
  return cleanupPrisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where, select: { id: true }, take: userBatchSize });
    if (!users.length) {
      return { reason, usersDeleted: 0, mailboxesDeleted: 0, emailsDeleted: 0, sessionsDeleted: 0, paymentsDeleted: 0 };
    }

    const userIds = users.map((user) => user.id);
    const [emailsDeleted, mailboxesDeleted, sessionsDeleted, paymentsDeleted] = await Promise.all([
      tx.email.count({ where: { mailbox: { userId: { in: userIds } } } }),
      tx.mailbox.count({ where: { userId: { in: userIds } } }),
      tx.session.count({ where: { userId: { in: userIds } } }),
      tx.payment.count({ where: { userId: { in: userIds } } })
    ]);

    await tx.mailbox.deleteMany({ where: { userId: { in: userIds } } });
    const deletedUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    return { reason, usersDeleted: deletedUsers.count, mailboxesDeleted, emailsDeleted, sessionsDeleted, paymentsDeleted };
  });
}

async function deleteStaleSessions(now) {
  const staleBefore = new Date(now.getTime() - staleSessionMaxAgeMs);
  return cleanupPrisma.$transaction(async (tx) => {
    const deleted = await tx.session.deleteMany({ where: { OR: [{ endedAt: { not: null } }, { createdAt: { lte: staleBefore } }] } });
    return { deleted: deleted.count, staleBefore: staleBefore.toISOString() };
  });
}

async function runCleanupTick() {
  const now = new Date();
  const softDeletedCutoff = new Date(now.getTime() - softDeleteHoldMs);
  const archivedMailboxes = await archiveExpiredMailboxes(now);
  const scheduledUsers = await hardDeleteUsers({ deleteAt: { lte: now }, deletedAt: null }, "deleteAt-expired");
  const softDeletedUsers = await hardDeleteUsers({ deletedAt: { lte: softDeletedCutoff } }, "deletedAt-plus-30d");
  const staleSessions = await deleteStaleSessions(now);
  logger.info("cleanup.tick.complete", { archivedMailboxes, scheduledUsers, softDeletedUsers, staleSessions });
}

async function runTickSafely(trigger) {
  if (cleanupInProgress) {
    logger.warn("cleanup.tick.skipped", { trigger, reason: "already-running" });
    return;
  }
  cleanupInProgress = true;
  logger.info("cleanup.tick.started", { trigger, cleanupIntervalMs });
  try {
    await runCleanupTick();
  } catch (error) {
    const message = getErrorMessage(error);
    await captureException(error, { worker: "cleanup-cron", phase: "tick", trigger });
    logger.error("cleanup.tick.failed", { trigger, message });
  } finally {
    cleanupInProgress = false;
  }
}

function scheduleLoop() {
  cleanupIntervalHandle = setInterval(() => {
    if (stopRequested) return;
    void runTickSafely("interval");
  }, cleanupIntervalMs);
}

async function shutdown(signal) {
  stopRequested = true;
  if (cleanupIntervalHandle) clearInterval(cleanupIntervalHandle);
  logger.info("cleanup.shutdown.started", { signal });
  await cleanupPrisma.$disconnect();
  logger.info("cleanup.shutdown.completed", { signal });
  process.exit(0);
}

async function start() {
  logger.info("cleanup.worker.started", { cleanupIntervalMs, softDeleteHoldMs, staleSessionMaxAgeMs, userBatchSize });
  await runTickSafely("startup");
  scheduleLoop();
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    const message = getErrorMessage(error);
    void captureException(error, { worker: "cleanup-cron", phase: "shutdown", signal: "SIGINT" });
    logger.error("cleanup.shutdown.failed", { signal: "SIGINT", message });
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    const message = getErrorMessage(error);
    void captureException(error, { worker: "cleanup-cron", phase: "shutdown", signal: "SIGTERM" });
    logger.error("cleanup.shutdown.failed", { signal: "SIGTERM", message });
    process.exit(1);
  });
});

start().catch((error) => {
  const message = getErrorMessage(error);
  void captureException(error, { worker: "cleanup-cron", phase: "start" });
  logger.error("cleanup.worker.failed", { message });
  process.exit(1);
});
