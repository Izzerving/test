import { PaymentPlan, Tier } from "@prisma/client";

export const paymentPlans = {
  PREMIUM_MONTHLY: {
    plan: PaymentPlan.PREMIUM_MONTHLY,
    targetTier: Tier.PREMIUM,
    title: "Premium / 30 дней",
    description: "До 20 активных ящиков, ручной выбор адреса и расширенные сроки.",
    amountUsd: 9.99,
    periodLabel: "30 дней"
  },
  UNLIMITED_LIFETIME: {
    plan: PaymentPlan.UNLIMITED_LIFETIME,
    targetTier: Tier.UNLIMITED,
    title: "Unlimited / lifetime",
    description: "До 100 активных ящиков, история до года и безлимитный lifetime-доступ.",
    amountUsd: 149,
    periodLabel: "Lifetime"
  }
} as const;

export type SupportedPaymentPlan = keyof typeof paymentPlans;

export function getPaymentPlan(plan: SupportedPaymentPlan) {
  return paymentPlans[plan];
}

export function listPaymentPlans() {
  return Object.values(paymentPlans);
}
