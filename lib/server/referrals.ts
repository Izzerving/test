import { randomBytes } from "crypto";
import { PaymentStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const REFERRAL_SIGNUP_BONUS_USD = "2.00";
const REFERRAL_PAYMENT_PERCENT = 0.1;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type TxClient = Prisma.TransactionClient | PrismaClient;

type ConfirmPaymentResult =
  | { status: "not_found" }
  | { status: "not_pending"; paymentId: string }
  | { status: "already_confirmed"; paymentId: string; userId: string; bonusAwarded: boolean; durationMs: number }
  | { status: "confirmed"; paymentId: string; userId: string; bonusAwarded: boolean; durationMs: number };

function randomReferralCode(length = 10) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length]).join("");
}

function roundUsd(value: { toString(): string } | number | string) {
  const numeric = Number(typeof value === "object" ? value.toString() : value);
  return numeric.toFixed(2);
}

export async function generateUniqueReferralCode(tx: TxClient = prisma) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const referralCode = randomReferralCode();
    const existing = await tx.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!existing) {
      return referralCode;
    }
  }

  throw new Error("Failed to generate unique referral code");
}

export async function ensureReferralCode(userId: string) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true }
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  if (existingUser.referralCode) {
    return existingUser.referralCode;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const referralCode = await generateUniqueReferralCode(prisma);
    const updated = await prisma.user.updateMany({
      where: { id: userId, referralCode: null },
      data: { referralCode }
    });

    if (updated.count > 0) {
      return referralCode;
    }

    const latest = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (latest?.referralCode) {
      return latest.referralCode;
    }
  }

  throw new Error("Failed to ensure referral code");
}

export async function applySignupReferralBonus(params: { userId: string; referralCode: string }) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: params.userId },
      select: { id: true, referredById: true }
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.referredById) {
      return { applied: false, reason: "already_referred" as const };
    }

    const referrer = await tx.user.findUnique({
      where: { referralCode: params.referralCode },
      select: { id: true, publicId: true }
    });

    if (!referrer) {
      return { applied: false, reason: "invalid_referral_code" as const };
    }

    if (referrer.id === user.id) {
      return { applied: false, reason: "self_referral" as const };
    }

    const existingBonus = await tx.referralBonus.findFirst({
      where: {
        referredId: user.id,
        type: "SIGNUP"
      },
      select: { id: true }
    });

    await tx.user.update({
      where: { id: user.id },
      data: { referredById: referrer.id }
    });

    if (!existingBonus) {
      await tx.referralBonus.create({
        data: {
          referrerId: referrer.id,
          referredId: user.id,
          type: "SIGNUP",
          amountUsd: REFERRAL_SIGNUP_BONUS_USD
        }
      });

      await tx.user.update({
        where: { id: referrer.id },
        data: {
          referralBalance: {
            increment: REFERRAL_SIGNUP_BONUS_USD
          }
        }
      });
    }

    return {
      applied: true,
      referrerId: referrer.id,
      reason: "linked" as const
    };
  });
}

async function maybeApplyPaymentReferralBonus(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: {
        select: {
          id: true,
          referredById: true
        }
      },
      referralBonus: {
        select: {
          id: true
        }
      }
    }
  });

  if (!payment?.user.referredById || payment.referralBonus) {
    return false;
  }

  const amountUsd = roundUsd(Number(payment.amountUsd) * REFERRAL_PAYMENT_PERCENT);
  if (Number(amountUsd) <= 0) {
    return false;
  }

  await tx.referralBonus.create({
    data: {
      referrerId: payment.user.referredById,
      referredId: payment.user.id,
      type: "PAYMENT",
      amountUsd,
      fromPaymentId: payment.id
    }
  });

  await tx.user.update({
    where: { id: payment.user.referredById },
    data: {
      referralBalance: {
        increment: amountUsd
      }
    }
  });

  return true;
}

export async function confirmPaymentAndApplyReferral(paymentId: string): Promise<ConfirmPaymentResult> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return { status: "not_found" as const };
    }

    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.CONFIRMED) {
      return { status: "not_pending" as const, paymentId: payment.id };
    }

    if (payment.status === PaymentStatus.PENDING) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          processingLock: null,
          lockExpiresAt: null
        }
      });

      await tx.user.update({ where: { id: payment.userId }, data: { tier: payment.targetTier } });
    }

    const bonusAwarded = await maybeApplyPaymentReferralBonus(tx, payment.id);

    return {
      status: payment.status === PaymentStatus.CONFIRMED ? "already_confirmed" as const : "confirmed" as const,
      paymentId: payment.id,
      userId: payment.userId,
      bonusAwarded,
      durationMs: Date.now() - payment.createdAt.getTime()
    };
  });
}

export function resolveReferralLink(referralCode: string, origin?: string | null) {
  const configuredOrigin = origin
    || process.env.APP_URL
    || (process.env.NEXT_PUBLIC_APP_DOMAIN ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}` : "http://localhost:3000");

  return `${configuredOrigin.replace(/\/$/, "")}/?ref=${encodeURIComponent(referralCode)}`;
}
