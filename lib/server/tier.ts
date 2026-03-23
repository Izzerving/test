import { Tier } from "@prisma/client";

export const tierMailboxLimit: Record<Tier, number> = {
  FREE_GUEST: 1,
  FREE_KEY: 1,
  PREMIUM: 20,
  UNLIMITED: 100
};

export const tierExtendOptions: Record<Tier, number[]> = {
  FREE_GUEST: [30, 180],
  FREE_KEY: [30, 180, 360, 720, 1440, 2880],
  PREMIUM: [30, 180, 360, 720, 1440, 2880, 10080, 43200],
  UNLIMITED: [30, 180, 360, 720, 1440, 2880, 10080, 43200]
};

export function canUseCustomAddress(tier: Tier) {
  return tier === Tier.PREMIUM || tier === Tier.UNLIMITED;
}

export function domainTierForUserTier(tier: Tier) {
  if (tier === Tier.PREMIUM) return "PREMIUM" as const;
  if (tier === Tier.UNLIMITED) return "UNLIMITED" as const;
  return "FREE" as const;
}
