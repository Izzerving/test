import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.payments.list");

export async function GET() {
  try {
    const session = await getSessionByToken();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payments = await prisma.payment.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        targetTier: true,
        plan: true,
        method: true,
        status: true,
        amountUsd: true,
        currency: true,
        createdAt: true,
        confirmedAt: true,
        retryCount: true
      }
    });

    return NextResponse.json({ payments });
  } catch (error) {
    await captureException(error, { path: "/api/payments/list", method: "GET" });
    logger.error("api.payments.list.failed", { path: "/api/payments/list", method: "GET", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
