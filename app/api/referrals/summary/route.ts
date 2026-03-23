import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureReferralCode, resolveReferralLink } from "@/lib/server/referrals";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.referrals.summary");

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const referralCode = await ensureReferralCode(session.userId);
    const [user, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          referralBalance: true,
          referrals: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              publicId: true,
              tier: true,
              createdAt: true,
              payments: {
                where: { status: "CONFIRMED" },
                select: { amountUsd: true }
              },
              referralBonusesReceived: {
                where: { referrerId: session.userId },
                select: { amountUsd: true }
              }
            }
          },
          referralBonusesEarned: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              amountUsd: true,
              createdAt: true,
              referred: {
                select: { publicId: true, tier: true }
              }
            }
          },
          withdrawals: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              amountUsd: true,
              moneroAddress: true,
              memo: true,
              status: true,
              createdAt: true,
              processedAt: true
            }
          }
        }
      }),
      prisma.globalSetting.findMany({ where: { key: { in: ["min_withdrawal_usd"] } } })
    ]);

    const minWithdrawalUsd = settings.find((item: { key: string; value: string }) => item.key === "min_withdrawal_usd")?.value || "50";

    return NextResponse.json({
      referralCode,
      referralLink: resolveReferralLink(referralCode, request.nextUrl.origin),
      referralBalance: Number(user?.referralBalance || 0).toFixed(2),
      minWithdrawalUsd,
      referrals: (user?.referrals || []).map((referral) => ({
        id: referral.id,
        publicId: referral.publicId,
        tier: referral.tier,
        joinedAt: referral.createdAt.toISOString(),
        totalPaymentsUsd: referral.payments.reduce((sum: number, payment: { amountUsd: { toString(): string } }) => sum + Number(payment.amountUsd.toString()), 0).toFixed(2),
        earnedUsd: referral.referralBonusesReceived.reduce((sum: number, bonus: { amountUsd: { toString(): string } }) => sum + Number(bonus.amountUsd.toString()), 0).toFixed(2)
      })),
      recentBonuses: (user?.referralBonusesEarned || []).map((bonus) => ({
        id: bonus.id,
        type: bonus.type,
        amountUsd: Number(bonus.amountUsd.toString()).toFixed(2),
        createdAt: bonus.createdAt.toISOString(),
        referredPublicId: bonus.referred.publicId,
        referredTier: bonus.referred.tier
      })),
      withdrawals: (user?.withdrawals || []).map((withdrawal) => ({
        id: withdrawal.id,
        amountUsd: Number(withdrawal.amountUsd.toString()).toFixed(2),
        moneroAddress: withdrawal.moneroAddress,
        memo: withdrawal.memo,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
        processedAt: withdrawal.processedAt?.toISOString() || null
      }))
    });
  } catch (error) {
    await captureException(error, { path: "/api/referrals/summary", method: "GET" });
    logger.error("api.referrals.summary.failed", {
      path: "/api/referrals/summary",
      method: "GET",
      error: getErrorMessage(error)
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
