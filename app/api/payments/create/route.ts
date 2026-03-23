import { NextRequest, NextResponse } from "next/server";
import { PaymentPlan, PaymentStatus, Tier } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { createCryptoBotInvoice, createMoneroIntent, createStarsInvoice, normalizeMethod } from "@/lib/server/payments/adapters";
import { buildIdempotencyKey } from "@/lib/server/payments/idempotency";
import { enqueuePaymentJob } from "@/lib/server/payments/queue";
import { markPaymentCreated } from "@/lib/server/payments/metrics";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";
import { getPaymentPlan } from "@/lib/server/payments/plans";

const schema = z.object({
  method: z.enum(["TELEGRAM_STARS", "CRYPTOBOT", "MONERO", "MANUAL"]),
  plan: z.nativeEnum(PaymentPlan),
  targetTier: z.nativeEnum(Tier),
  amountUsd: z.number().positive().optional(),
  currency: z.string().min(2).max(10).default("USD")
});

const logger = createLogger("api.payments.create");

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionByToken();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const planMeta = getPaymentPlan(parsed.data.plan);
    if (planMeta.targetTier !== parsed.data.targetTier) {
      return NextResponse.json({ error: "Invalid target tier for selected plan" }, { status: 400 });
    }
    const amountUsd = parsed.data.amountUsd ?? planMeta.amountUsd;
    if (Math.abs(amountUsd - planMeta.amountUsd) > 0.001) {
      return NextResponse.json({ error: "Amount does not match selected plan" }, { status: 400 });
    }

    const method = normalizeMethod(parsed.data.method);
    if (!method) return NextResponse.json({ error: "Invalid method" }, { status: 400 });

    const idempotencyKey = buildIdempotencyKey(session.userId, `${parsed.data.method}:${parsed.data.plan}`, amountUsd, parsed.data.currency);
    const existing = await prisma.payment.findFirst({
      where: { userId: session.userId, idempotencyKey, status: PaymentStatus.PENDING },
      select: { id: true, method: true, status: true, externalId: true, memo: true, targetTier: true, plan: true }
    });
    if (existing) {
      return NextResponse.json({ payment: existing, providerPayload: { reused: true } });
    }

    let providerPayload: Record<string, unknown> = {};
    try {
      if (method === "TELEGRAM_STARS") providerPayload = await createStarsInvoice(amountUsd);
      if (method === "CRYPTOBOT") providerPayload = await createCryptoBotInvoice(amountUsd);
      if (method === "MONERO") providerPayload = await createMoneroIntent(amountUsd);
      if (method === "MANUAL") providerPayload = { provider: "manual", externalId: `manual_${parsed.data.plan}_${Date.now()}` };
    } catch (error) {
      await captureException(error, { route: "/api/payments/create", area: "payments", method });
      logger.error("payments.provider_unavailable", { method, error: getErrorMessage(error) });

      return NextResponse.json(
        {
          error: "Payment provider unavailable",
          details: error instanceof Error ? error.message : "unknown_error"
        },
        { status: 503 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        userId: session.userId,
        targetTier: parsed.data.targetTier,
        plan: parsed.data.plan,
        method,
        status: PaymentStatus.PENDING,
        amountUsd,
        currency: parsed.data.currency,
        externalId: String(providerPayload.externalId || ""),
        idempotencyKey,
        memo: String(providerPayload.memo || ""),
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000)
      },
      select: { id: true, method: true, status: true, externalId: true, memo: true, idempotencyKey: true, targetTier: true, plan: true }
    });

    await enqueuePaymentJob(payment.id, "created");
    await markPaymentCreated();

    return NextResponse.json({ payment, providerPayload, planMeta });
  } catch (error) {
    await captureException(error, { route: "/api/payments/create", area: "payments" });
    logger.error("payments.unhandled_error", { error: getErrorMessage(error) });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
