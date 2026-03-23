import { DomainStatus, Tier } from "@prisma/client";

export function canRestoreMailboxForTier(tier: Tier) {
  return tier === Tier.PREMIUM || tier === Tier.UNLIMITED;
}

export function canAccessArchivedMailbox(params: {
  domainStatus: DomainStatus;
  mailboxDeletedAt: Date | null;
}) {
  if (params.mailboxDeletedAt) return false;

  return params.domainStatus === DomainStatus.active
    || params.domainStatus === DomainStatus.exhausted
    || params.domainStatus === DomainStatus.archived;
}
