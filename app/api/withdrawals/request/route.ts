import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import {
  captureException,
  createLogger,
  getErrorMessage,
} from "@/lib/server/observability";

const logger = createLogger("api.withdrawals.request");
const schema = z.object({
  amountUsd: z.coerce.number().positive(),
  moneroAddress: z.string().min(10),
  memo: z.string().max(300).optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const minimumSetting = await prisma.globalSetting.findUnique({
      where: { key: "min_withdrawal_usd" },
      select: { value: true },
    });
    const minWithdrawalUsd = Number(minimumSetting?.value || 50);
    const amountUsd = Number(parsed.data.amountUsd.toFixed(2));

    const [user, reserved] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { referralBalance: true },
      }),
      prisma.withdrawal.aggregate({
        where: {
          userId: session.userId,
          status: { in: ["PENDING", "APPROVED"] },
        },
        _sum: { amountUsd: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (amountUsd < minWithdrawalUsd) {
      return NextResponse.json(
        { error: `Minimum withdrawal is ${minWithdrawalUsd} USD` },
        { status: 400 },
      );
    }

    const availableBalance =
      Number(user.referralBalance) - Number(reserved._sum.amountUsd || 0);
    if (amountUsd > availableBalance) {
      return NextResponse.json(
        { error: "Insufficient available referral balance" },
        { status: 400 },
      );
    }

    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: session.userId,
        amountUsd: amountUsd.toFixed(2),
        moneroAddress: parsed.data.moneroAddress.trim(),
        memo: parsed.data.memo?.trim() || null,
        status: "PENDING",
      },
      select: {
        id: true,
        amountUsd: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      withdrawal: {
        id: withdrawal.id,
        amountUsd: Number(withdrawal.amountUsd).toFixed(2),
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      },
    });
  } catch (error) {
    await captureException(error, {
      path: "/api/withdrawals/request",
      method: "POST",
    });
    logger.error("api.withdrawals.request.failed", {
      path: "/api/withdrawals/request",
      method: "POST",
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
