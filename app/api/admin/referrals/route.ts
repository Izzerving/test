import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestHasAdminAccess } from "@/lib/server/admin";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("adjust-balance"), userId: z.string().min(1), amountUsd: z.coerce.number() }),
  z.object({ action: z.literal("remove-referral"), referredUserId: z.string().min(1) }),
  z.object({ action: z.literal("delete-bonus"), bonusId: z.string().min(1) })
]);

export async function GET(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [topReferrers, bonuses, totals] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ referralBonusesEarned: { some: {} } }, { referrals: { some: {} } }]
      },
      orderBy: { referralBalance: "desc" },
      take: 25,
      select: {
        id: true,
        publicId: true,
        tier: true,
        referralBalance: true,
        _count: { select: { referrals: true, referralBonusesEarned: true } },
        referralBonusesEarned: {
          select: { amountUsd: true }
        }
      }
    }),
    prisma.referralBonus.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        type: true,
        amountUsd: true,
        createdAt: true,
        fromPaymentId: true,
        referrer: { select: { id: true, publicId: true, tier: true } },
        referred: { select: { id: true, publicId: true, tier: true } }
      }
    }),
    prisma.referralBonus.aggregate({
      _sum: { amountUsd: true },
      _count: { _all: true }
    })
  ]);

  return NextResponse.json({
    topReferrers: topReferrers.map((user) => ({
      id: user.id,
      publicId: user.publicId,
      tier: user.tier,
      referralBalance: Number(user.referralBalance).toFixed(2),
      referralCount: user._count.referrals,
      bonusCount: user._count.referralBonusesEarned,
      totalEarnedUsd: user.referralBonusesEarned.reduce((sum, bonus) => sum + Number(bonus.amountUsd), 0).toFixed(2)
    })),
    totals: {
      totalBonusUsd: Number(totals._sum.amountUsd || 0).toFixed(2),
      totalBonuses: totals._count._all
    },
    bonuses: bonuses.map((bonus) => ({
      id: bonus.id,
      type: bonus.type,
      amountUsd: Number(bonus.amountUsd).toFixed(2),
      createdAt: bonus.createdAt.toISOString(),
      fromPaymentId: bonus.fromPaymentId,
      referrer: bonus.referrer,
      referred: bonus.referred
    }))
  });
}

export async function PATCH(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data = parsed.data;

  if (data.action === "adjust-balance") {
    const nextBalance = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: data.userId }, select: { referralBalance: true } });
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }
      const updatedValue = Number(user.referralBalance) + data.amountUsd;
      if (updatedValue < 0) {
        throw new Error("NEGATIVE_BALANCE");
      }
      const updated = await tx.user.update({
        where: { id: data.userId },
        data: { referralBalance: updatedValue.toFixed(2) },
        select: { referralBalance: true }
      });
      return updated;
    }).catch((error: Error) => {
      if (error.message === "USER_NOT_FOUND") return null;
      if (error.message === "NEGATIVE_BALANCE") return "NEGATIVE_BALANCE" as const;
      throw error;
    });

    if (!nextBalance) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (nextBalance === "NEGATIVE_BALANCE") {
      return NextResponse.json({ error: "Balance cannot be negative" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, referralBalance: Number(nextBalance.referralBalance).toFixed(2) });
  }

  if (data.action === "delete-bonus") {
    const deleted = await prisma.$transaction(async (tx) => {
      const bonus = await tx.referralBonus.findUnique({ where: { id: data.bonusId } });
      if (!bonus) return null;

      await tx.referralBonus.delete({ where: { id: bonus.id } });
      await tx.user.update({
        where: { id: bonus.referrerId },
        data: { referralBalance: { decrement: bonus.amountUsd } }
      });
      return bonus.id;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Referral bonus not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  const removed = await prisma.$transaction(async (tx) => {
    const referredUser = await tx.user.findUnique({
      where: { id: data.referredUserId },
      select: { id: true, referredById: true }
    });

    if (!referredUser) return null;

    const bonuses = await tx.referralBonus.findMany({
      where: { referredId: referredUser.id },
      select: { id: true, referrerId: true, amountUsd: true }
    });

    const totalsByReferrer = bonuses.reduce((acc: Record<string, number>, bonus: { referrerId: string; amountUsd: { toString(): string } }) => {
      acc[bonus.referrerId] = (acc[bonus.referrerId] || 0) + Number(bonus.amountUsd.toString());
      return acc;
    }, {});

    for (const [referrerId, total] of Object.entries(totalsByReferrer)) {
      await tx.user.update({
        where: { id: referrerId },
        data: { referralBalance: { decrement: Number(total.toFixed(2)) } }
      });
    }

    await tx.referralBonus.deleteMany({ where: { referredId: referredUser.id } });
    await tx.user.update({ where: { id: referredUser.id }, data: { referredById: null } });

    return referredUser.id;
  });

  if (!removed) {
    return NextResponse.json({ error: "Referral user not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
