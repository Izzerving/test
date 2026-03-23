import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestHasAdminAccess } from "@/lib/server/admin";

const querySchema = z.object({
  status: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  take: z.coerce.number().int().min(1).max(200).default(100)
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), withdrawalId: z.string().min(1) }),
  z.object({ action: z.literal("reject"), withdrawalId: z.string().min(1) }),
  z.object({ action: z.literal("paid"), withdrawalId: z.string().min(1) }),
  z.object({ action: z.literal("adjust-balance"), userId: z.string().min(1), amountUsd: z.coerce.number() })
]);

export async function GET(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") || undefined,
    minAmount: url.searchParams.get("minAmount") || undefined,
    maxAmount: url.searchParams.get("maxAmount") || undefined,
    take: url.searchParams.get("take") || undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { status, minAmount, maxAmount, take } = parsed.data;
  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(minAmount || maxAmount
        ? {
            amountUsd: {
              ...(typeof minAmount === "number" ? { gte: minAmount.toFixed(2) } : {}),
              ...(typeof maxAmount === "number" ? { lte: maxAmount.toFixed(2) } : {})
            }
          }
        : {})
    },
    orderBy: { createdAt: "asc" },
    take,
    include: {
      user: { select: { id: true, publicId: true, tier: true, referralBalance: true } }
    }
  });

  return NextResponse.json({
    withdrawals: withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      amountUsd: Number(withdrawal.amountUsd).toFixed(2),
      moneroAddress: withdrawal.moneroAddress,
      memo: withdrawal.memo,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt.toISOString(),
      processedAt: withdrawal.processedAt?.toISOString() || null,
      user: {
        id: withdrawal.user.id,
        publicId: withdrawal.user.publicId,
        tier: withdrawal.user.tier,
        referralBalance: Number(withdrawal.user.referralBalance).toFixed(2)
      }
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
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: data.userId }, select: { referralBalance: true } });
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }
      const nextValue = Number(user.referralBalance) + data.amountUsd;
      if (nextValue < 0) {
        throw new Error("NEGATIVE_BALANCE");
      }
      return tx.user.update({
        where: { id: data.userId },
        data: { referralBalance: nextValue.toFixed(2) },
        select: { referralBalance: true }
      });
    }).catch((error: Error) => {
      if (error.message === "USER_NOT_FOUND") return null;
      if (error.message === "NEGATIVE_BALANCE") return "NEGATIVE_BALANCE" as const;
      throw error;
    });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (updated === "NEGATIVE_BALANCE") {
      return NextResponse.json({ error: "Balance cannot be negative" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, referralBalance: Number(updated.referralBalance).toFixed(2) });
  }

  const nextStatus = data.action === "approve"
    ? "APPROVED"
    : data.action === "reject"
      ? "REJECTED"
      : "PAID";

  const result = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({
      where: { id: data.withdrawalId },
      include: { user: { select: { id: true, referralBalance: true } } }
    });
    if (!withdrawal) return null;

    if (data.action === "paid") {
      if (Number(withdrawal.user.referralBalance) < Number(withdrawal.amountUsd)) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      if (withdrawal.status !== "PAID") {
        await tx.user.update({
          where: { id: withdrawal.user.id },
          data: { referralBalance: { decrement: withdrawal.amountUsd } }
        });
      }
    }

    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: nextStatus,
        processedAt: new Date()
      }
    });

    return updated;
  }).catch((error: Error) => {
    if (error.message === "INSUFFICIENT_BALANCE") return "INSUFFICIENT_BALANCE" as const;
    throw error;
  });

  if (!result) {
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  }
  if (result === "INSUFFICIENT_BALANCE") {
    return NextResponse.json({ error: "User has insufficient balance for paid status" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status, processedAt: result.processedAt?.toISOString() || null });
}
