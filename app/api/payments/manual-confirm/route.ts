import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmPaymentAndApplyReferral } from "@/lib/server/referrals";
import { z } from "zod";
import { markPaymentConfirmed } from "@/lib/server/payments/metrics";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const schema = z.object({
  paymentId: z.string(),
  approve: z.boolean().default(true)
});

const logger = createLogger("api.payments.manual-confirm");

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get("x-admin-key");
    if (!process.env.ADMIN_SUPER_KEY || adminKey !== process.env.ADMIN_SUPER_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const payment = await prisma.payment.findUnique({ where: { id: parsed.data.paymentId } });
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    if (!parsed.data.approve) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.CANCELED,
          confirmedAt: null
        }
      });
      return NextResponse.json({ ok: true });
    }

    const result = await confirmPaymentAndApplyReferral(payment.id);
    if (result.status === "confirmed") {
      await markPaymentConfirmed(Math.max(result.durationMs, 0));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureException(error, { path: "/api/payments/manual-confirm", method: "POST" });
    logger.error("api.payments.manual_confirm.failed", { path: "/api/payments/manual-confirm", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
