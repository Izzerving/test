import { NextRequest, NextResponse } from "next/server";
import { DomainStatus, DomainTier, PaymentStatus, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_SUPER_KEY || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, domains, payments, activeMailboxes, archivedMailboxes, emails] = await Promise.all([
    prisma.user.groupBy({ by: ["tier"], _count: { _all: true } }),
    prisma.domain.groupBy({ by: ["tier", "status"], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status", "targetTier"], _count: { _all: true } }),
    prisma.mailbox.count({ where: { isActive: true, deletedAt: null } }),
    prisma.mailbox.count({ where: { OR: [{ isActive: false }, { deletedAt: { not: null } }] } }),
    prisma.email.count()
  ]);

  const userByTier = Object.fromEntries(Object.values(Tier).map((tier) => [tier, 0])) as Record<Tier, number>;
  for (const row of users) userByTier[row.tier] = row._count._all;

  const domainMatrix = Object.fromEntries(
    Object.values(DomainTier).map((tier) => [tier, Object.fromEntries(Object.values(DomainStatus).map((status) => [status, 0]))])
  ) as Record<DomainTier, Record<DomainStatus, number>>;
  for (const row of domains) domainMatrix[row.tier][row.status] = row._count._all;

  const paymentMatrix = Object.fromEntries(
    Object.values(PaymentStatus).map((status) => [status, Object.fromEntries([Tier.PREMIUM, Tier.UNLIMITED].map((tier) => [tier, 0]))])
  ) as Record<PaymentStatus, Record<"PREMIUM" | "UNLIMITED", number>>;
  for (const row of payments) {
    if (row.targetTier === Tier.PREMIUM || row.targetTier === Tier.UNLIMITED) {
      paymentMatrix[row.status][row.targetTier] = row._count._all;
    }
  }

  return NextResponse.json({
    stats: {
      users: userByTier,
      domains: domainMatrix,
      payments: paymentMatrix,
      mailboxes: {
        active: activeMailboxes,
        history: archivedMailboxes
      },
      emails,
      ts: new Date().toISOString()
    }
  });
}
