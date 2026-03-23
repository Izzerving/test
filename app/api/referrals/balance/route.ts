import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.referrals.balance");

export async function GET() {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { referralBalance: true }
    });

    return NextResponse.json({
      referralBalance: Number(user?.referralBalance || 0).toFixed(2)
    });
  } catch (error) {
    await captureException(error, { path: "/api/referrals/balance", method: "GET" });
    logger.error("api.referrals.balance.failed", {
      path: "/api/referrals/balance",
      method: "GET",
      error: getErrorMessage(error)
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
