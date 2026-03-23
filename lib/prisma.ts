import { PrismaClient } from "@prisma/client";
import { captureException, createLogger, getErrorMessage, installGlobalErrorHandlers } from "@/lib/server/observability";

declare global {
  var prisma: PrismaClient | undefined;
}

const logger = createLogger("prisma");

export const prisma = global.prisma || new PrismaClient();

prisma.$use(async (params, next) => {
  const startedAt = Date.now();

  try {
    const result = await next(params);
    const durationMs = Date.now() - startedAt;

    if (durationMs > 300) {
      logger.warn("prisma.slow_query", {
        model: params.model,
        action: params.action,
        durationMs
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    logger.error("prisma.query_error", {
      model: params.model,
      action: params.action,
      durationMs,
      message: getErrorMessage(error)
    });

    await captureException(error, {
      area: "prisma",
      model: params.model,
      action: params.action,
      durationMs
    });

    throw error;
  }
});

installGlobalErrorHandlers();

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
