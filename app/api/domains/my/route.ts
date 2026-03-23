import { NextResponse } from "next/server";
import { DomainStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { getUserDomainIds } from "@/lib/server/user-domain-access";
import { domainTierForUserTier } from "@/lib/server/tier";

export async function GET() {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const domainIds = await getUserDomainIds(session.userId);
  const domainTier = domainTierForUserTier(session.user.tier);
  const [poolDomains, assignedDomains] = await Promise.all([
    prisma.domain.findMany({
      where: { tier: domainTier, status: DomainStatus.active },
      orderBy: { name: "asc" }
    }),
    domainIds.length
      ? prisma.domain.findMany({ where: { id: { in: domainIds }, status: DomainStatus.active }, orderBy: { name: "asc" } })
      : Promise.resolve([])
  ]);
  const domains = Array.from(new Map([...poolDomains, ...assignedDomains].map((domain) => [domain.id, domain])).values());

  return NextResponse.json({ domains });
}
