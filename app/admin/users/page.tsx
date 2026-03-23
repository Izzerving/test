import { Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin";
import UsersClient, { type AdminUserRecord } from "./users-client";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();

  const params = (await searchParams) || {};
  const rawQuery = typeof params.q === "string" ? params.q.trim() : "";
  const query = rawQuery.length >= 5 ? rawQuery : "";

  const users = query
    ? await prisma.user.findMany({
        where: {
          publicId: {
            contains: query,
            mode: "insensitive",
          },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          mailboxes: {
            orderBy: { createdAt: "desc" },
            include: {
              domain: true,
              emails: {
                orderBy: { receivedAt: "desc" },
                take: 200,
              },
            },
          },
          loginLogs: {
            orderBy: { createdAt: "desc" },
            take: 100,
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              amountUsd: true,
              status: true,
            },
          },
          referralBonusesEarned: {
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
              id: true,
              amountUsd: true,
            },
          },
          _count: {
            select: {
              mailboxes: true,
              loginLogs: true,
              referrals: true,
            },
          },
        },
      })
    : [];

  const serializedUsers: AdminUserRecord[] = users.map((user) => ({
    id: user.id,
    publicId: user.publicId,
    tier: user.tier,
    deletionInterval: user.deletionInterval,
    deleteAt: user.deleteAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
    referralBalance: Number(user.referralBalance).toFixed(2),
    stats: {
      mailboxCount: user._count.mailboxes,
      loginLogCount: user._count.loginLogs,
      emailCount: user.mailboxes.reduce(
        (sum, mailbox) => sum + mailbox.emails.length,
        0,
      ),
      referralCount: user._count.referrals,
      paymentsCount: user.payments.length,
      earnedReferralBonusUsd: user.referralBonusesEarned
        .reduce((sum, bonus) => sum + Number(bonus.amountUsd), 0)
        .toFixed(2),
    },
    mailboxes: user.mailboxes.map((mailbox) => ({
      id: mailbox.id,
      address: mailbox.address,
      expiresAt: mailbox.expiresAt.toISOString(),
      createdAt: mailbox.createdAt.toISOString(),
      domainName: mailbox.domain.name,
      emails: mailbox.emails.map((email) => ({
        id: email.id,
        fromAddress: email.fromAddress,
        subject: email.subject,
        receivedAt: email.receivedAt.toISOString(),
        mailboxId: mailbox.id,
        mailboxAddress: mailbox.address,
        textBody: email.textBody ?? "",
      })),
    })),
    loginLogs: user.loginLogs.map((loginLog) => ({
      id: loginLog.id,
      ip: loginLog.ip,
      createdAt: loginLog.createdAt.toISOString(),
      userAgent: loginLog.userAgent,
    })),
  }));

  return (
    <UsersClient
      initialUsers={serializedUsers}
      initialQuery={rawQuery}
      tierOptions={Object.values(Tier)}
    />
  );
}
