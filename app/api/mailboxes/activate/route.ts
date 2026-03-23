import { NextRequest, NextResponse } from "next/server";
import { Tier } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";

const schema = z.object({ mailboxId: z.string() });

const activationWindowDays: Record<Tier, number> = {
  FREE_GUEST: 0,
  FREE_KEY: 0,
  PREMIUM: 14,
  UNLIMITED: 365
};

export async function POST(request: NextRequest) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (session.user.tier !== Tier.PREMIUM && session.user.tier !== Tier.UNLIMITED) {
    return NextResponse.json({ error: "Activation available only for Premium/Unlimited" }, { status: 403 });
  }

  const mailbox = await prisma.mailbox.findFirst({
    where: { id: parsed.data.mailboxId, userId: session.userId },
    select: { id: true, createdAt: true }
  });

  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const maxAgeDays = activationWindowDays[session.user.tier];
  const oldestAllowed = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  if (mailbox.createdAt < oldestAllowed) {
    return NextResponse.json({ error: "Activation window expired for your tier" }, { status: 400 });
  }

  const updated = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: {
      isActive: true,
      expiresAt: new Date(Date.now() + 180 * 60 * 1000)
    },
    select: { id: true, address: true, expiresAt: true, isActive: true }
  });

  return NextResponse.json({ mailbox: updated });
}
