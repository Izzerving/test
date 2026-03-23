import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPaymentQueueStats } from "@/lib/server/payments/queue";
import { getPaymentSlaMetrics } from "@/lib/server/payments/metrics";

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_SUPER_KEY || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, activeMailboxes, pendingPayments, queueStats, sla] = await Promise.all([
    prisma.user.count(),
    prisma.mailbox.count({ where: { isActive: true } }),
    prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
    getPaymentQueueStats(),
    getPaymentSlaMetrics()
  ]);

  return NextResponse.json({
    stats: {
      users,
      activeMailboxes,
      pendingPayments,
      paymentQueueDepth: queueStats.depth,
      paymentDlqDepth: queueStats.dlqDepth,
      paymentSla: sla,
      ts: new Date().toISOString()
    }
  });
}
