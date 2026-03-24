import { NextRequest, NextResponse } from "next/server";
import { DeletionInterval, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDeleteAt, generateOneTimeKey, hashLookupSecret, hashSecret } from "@/lib/server/auth";
import { generateUniqueReferralCode, maybeApplyStartupBonus } from "@/lib/server/referrals";
import { z } from "zod";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const registerSchema = z.object({
  deletionInterval: z.nativeEnum(DeletionInterval),
  keyLength: z.number().int().min(10).max(20).optional(),
  acknowledged: z.literal(true)
});

function createPublicId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const logger = createLogger("api.auth.register");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const keyLength = typeof parsed.data.keyLength === "number" ? parsed.data.keyLength : 16;
    const oneTimeKey = generateOneTimeKey(keyLength);
    const keyHash = hashSecret(oneTimeKey);
    const keyLookupHash = hashLookupSecret(oneTimeKey);
    const referralCode = await generateUniqueReferralCode(prisma);

    const user = await prisma.user.create({
      data: {
        publicId: createPublicId(),
        tier: Tier.FREE_KEY,
        keyHash,
        keyLookupHash,
        keyShownAt: new Date(),
        deletionInterval: parsed.data.deletionInterval,
        deleteAt: buildDeleteAt(parsed.data.deletionInterval),
        referralCode
      },
      select: {
        id: true,
        publicId: true,
        tier: true,
        deletionInterval: true,
        deleteAt: true,
        referralCode: true
      }
    });

    const startupBonus = await maybeApplyStartupBonus(user.id);

    return NextResponse.json({
      user,
      oneTimeKey,
      startupBonusUsd: startupBonus.applied ? Number(startupBonus.amountUsd) : 0,
      warning: "Ключ больше никогда не будет показан. Потеря ключа = безвозвратная потеря аккаунта."
    });
  } catch (error) {
    await captureException(error, { path: "/api/auth/register", method: "POST" });
    logger.error("api.auth.register.failed", { path: "/api/auth/register", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
