import { Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin";
import StatsClient, { type StatsTierSlice, type StatsUserSearchItem } from "./stats-client";
import { Card } from "@/components/ui/card";

function startOfHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function startOfDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function AdminStatsPage() {
  await requireAdminPage();

  const [online, lkUsers, lastHour, lastDay, lastWeek, lastMonth, usersByTier, domains] = await Promise.all([
    prisma.session.count({ where: { endedAt: null } }),
    prisma.user.count({ where: { tier: { not: Tier.FREE_GUEST } } }),
    prisma.mailbox.count({ where: { createdAt: { gte: startOfHoursAgo(1) } } }),
    prisma.mailbox.count({ where: { createdAt: { gte: startOfDaysAgo(1) } } }),
    prisma.mailbox.count({ where: { createdAt: { gte: startOfDaysAgo(7) } } }),
    prisma.mailbox.count({ where: { createdAt: { gte: startOfDaysAgo(30) } } }),
    prisma.user.groupBy({ by: ["tier"], _count: { _all: true } }),
    prisma.domain.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { mailboxes: true } },
        mailboxes: {
          where: { isActive: true, deletedAt: null },
          select: { id: true }
        }
      }
    })
  ]);

  const tierMatrix = Object.values(Tier).map((tier) => ({
    name: tier,
    value: usersByTier.find((row) => row.tier === tier)?._count._all || 0
  }));

  const paidTierSet = new Set<Tier>([Tier.PREMIUM, Tier.UNLIMITED]);
  const freeTierSet = new Set<Tier>([Tier.FREE_GUEST, Tier.FREE_KEY]);
  const paidUsers = tierMatrix.filter((slice) => paidTierSet.has(slice.name as Tier)).reduce((sum, slice) => sum + slice.value, 0);
  const freeUsers = tierMatrix.filter((slice) => freeTierSet.has(slice.name as Tier)).reduce((sum, slice) => sum + slice.value, 0);

  const initialUserSearch: StatsUserSearchItem[] = [];

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Админка / Статистика</h1>
        <p className="text-sm text-muted">Онлайн, активность по ящикам, домены, тарифы и быстрый поиск пользователя со сменой тарифа.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-muted">Онлайн</p><p className="mt-2 text-3xl font-semibold">{online}</p></Card>
        <Card><p className="text-sm text-muted">Сколько в ЛК</p><p className="mt-2 text-3xl font-semibold">{lkUsers}</p></Card>
        <Card><p className="text-sm text-muted">Платных</p><p className="mt-2 text-3xl font-semibold">{paidUsers}</p></Card>
        <Card><p className="text-sm text-muted">Бесплатных</p><p className="mt-2 text-3xl font-semibold">{freeUsers}</p></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-muted">Новых ящиков / час</p><p className="mt-2 text-3xl font-semibold">{lastHour}</p></Card>
        <Card><p className="text-sm text-muted">Новых ящиков / сутки</p><p className="mt-2 text-3xl font-semibold">{lastDay}</p></Card>
        <Card><p className="text-sm text-muted">Новых ящиков / неделя</p><p className="mt-2 text-3xl font-semibold">{lastWeek}</p></Card>
        <Card><p className="text-sm text-muted">Новых ящиков / месяц</p><p className="mt-2 text-3xl font-semibold">{lastMonth}</p></Card>
      </div>

      <StatsClient
        tierSlices={tierMatrix as StatsTierSlice[]}
        tierOptions={Object.values(Tier)}
        domainStats={domains.map((domain) => ({
          id: domain.id,
          name: domain.name,
          totalMailboxes: domain._count.mailboxes,
          activeMailboxes: domain.mailboxes.length,
          tier: domain.tier
        }))}
        initialUsers={initialUserSearch}
      />
    </main>
  );
}
