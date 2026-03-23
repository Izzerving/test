import { prisma } from "@/lib/prisma";
import { markPaymentConfirmed } from "@/lib/server/payments/metrics";
import { confirmPaymentAndApplyReferral } from "@/lib/server/referrals";

export async function confirmPaymentByExternalId(externalId: string) {
  const payment = await prisma.payment.findFirst({ where: { externalId }, select: { id: true } });
  if (!payment) {
    return { status: "not_found" as const };
  }

  const result = await confirmPaymentAndApplyReferral(payment.id);

  if (result.status === "confirmed") {
    await markPaymentConfirmed(Math.max(result.durationMs, 0));
  }

  return result;
}
