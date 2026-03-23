import { NextResponse } from "next/server";
import { Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { canAccessArchivedMailbox, canRestoreMailboxForTier } from "@/lib/server/domain-service";
import { tierMailboxLimit } from "@/lib/server/tier";

const restoreDurationMinutes: Record<Tier, number> = {
  FREE_GUEST: 0,
  FREE_KEY: 0,
  PREMIUM: 180,
  UNLIMITED: 180
};

export async function PATCH(_: Request, context: { params: Promise<{ mailboxId: string }> }) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canRestoreMailboxForTier(session.user.tier)) {
    return NextResponse.json({ error: "Restore available only for Premium/Unlimited" }, { status: 403 });
  }

  const mailboxId = (await context.params).mailboxId;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id: mailboxId, userId: session.userId },
    select: {
      id: true,
      address: true,
      isActive: true,
      expiresAt: true,
      deletedAt: true,
      domain: { select: { status: true } }
    }
  });

  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  if (!canAccessArchivedMailbox({ domainStatus: mailbox.domain.status, mailboxDeletedAt: mailbox.deletedAt })) {
    return NextResponse.json({ error: "Mailbox deleted permanently" }, { status: 410 });
  }

  if (!mailbox.isActive) {
    const activeCount = await prisma.mailbox.count({
      where: { userId: session.userId, isActive: true, deletedAt: null }
    });

    if (activeCount >= tierMailboxLimit[session.user.tier]) {
      return NextResponse.json({ error: "Tier mailbox limit reached" }, { status: 400 });
    }
  }

  const nextExpiresAt = mailbox.expiresAt.getTime() > Date.now()
    ? mailbox.expiresAt
    : new Date(Date.now() + restoreDurationMinutes[session.user.tier] * 60 * 1000);

  const restoredMailbox = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: {
      isActive: true,
      expiresAt: nextExpiresAt
    },
    select: {
      id: true,
      address: true,
      isActive: true,
      expiresAt: true,
      createdAt: true
    }
  });

  const emails = await prisma.email.findMany({
    where: { mailboxId: mailbox.id },
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      textBody: true,
      htmlBody: true,
      receivedAt: true
    }
  });

  return NextResponse.json({ mailbox: restoredMailbox, emails });
}
