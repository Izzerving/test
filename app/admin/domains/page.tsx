import { DomainTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin";
import DomainsClient, { type AdminDomainRecord } from "./domains-client";

export default async function AdminDomainsPage() {
  await requireAdminPage();

  const domains = await prisma.domain.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: {
          mailboxes: true,
          userAccess: true
        }
      }
    }
  });

  const serializedDomains: AdminDomainRecord[] = domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    tier: domain.tier,
    status: domain.status,
    maxMailboxes: domain.maxMailboxes,
    currentMailboxes: domain.currentMailboxes,
    dnsNs: domain.dnsNs ?? "",
    transferAfterDays: domain.transferAfterDays ?? null,
    transferToTier: domain.transferToTier ?? null,
    createdAt: domain.createdAt.toISOString(),
    mailboxCount: domain._count.mailboxes,
    userAccessCount: domain._count.userAccess
  }));

  return <DomainsClient initialDomains={serializedDomains} tierOptions={Object.values(DomainTier)} />;
}
