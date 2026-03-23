import { prisma } from "@/lib/prisma";

export async function getUserDomainIds(userId: string) {
  const rows = await prisma.userDomainAccess.findMany({
    where: { userId },
    select: { domainId: true }
  });
  return rows.map((row) => row.domainId);
}

export async function assignDomainToUser(userId: string, domainId: string, isCustom = false) {
  await prisma.userDomainAccess.upsert({
    where: { userId_domainId: { userId, domainId } },
    update: { isCustom },
    create: { userId, domainId, isCustom }
  });
}

export async function unassignDomainFromUser(userId: string, domainId: string) {
  await prisma.userDomainAccess.deleteMany({ where: { userId, domainId } });
}
