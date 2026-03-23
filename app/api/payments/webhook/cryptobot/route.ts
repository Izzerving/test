import { NextRequest, NextResponse } from "next/server";
import { confirmPaymentByExternalId } from "@/lib/server/payments/service";
import { verifyWebhookSignature } from "@/lib/server/payments/adapters";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.payments.webhook.cryptobot");

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-webhook-signature") || request.headers.get("crypto-pay-api-signature");

    const secret = process.env.CRYPTOBOT_WEBHOOK_SECRET || process.env.CRYPTOBOT_MERCHANT_TOKEN;
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (() => { try { return JSON.parse(rawBody || "{}"); } catch { return {}; } })();
    const externalId = body?.externalId || body?.payload || body?.invoice_id;
    if (!externalId) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const result = await confirmPaymentByExternalId(String(externalId));
    if (result.status === "not_found") return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    return NextResponse.json({ ok: true, status: result.status, bonusAwarded: "bonusAwarded" in result ? result.bonusAwarded : false });
  } catch (error) {
    await captureException(error, { path: "/api/payments/webhook/cryptobot", method: "POST" });
    logger.error("api.payments.webhook.cryptobot.failed", { path: "/api/payments/webhook/cryptobot", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
