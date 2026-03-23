import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueuePaymentJob } from "@/lib/server/payments/queue";

export async function POST(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_SUPER_KEY || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const stale = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PENDING,
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } },
        { lockExpiresAt: { lt: now } }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true }
  });

  for (const p of stale) {
    await prisma.payment.update({
      where: { id: p.id },
      data: { processingLock: null, lockExpiresAt: null, nextRetryAt: now }
    });
    await enqueuePaymentJob(p.id, "reconcile");
  }

  return NextResponse.json({ ok: true, requeued: stale.length });
}
