import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";

const adminSections = [
  {
    href: "/admin/stats",
    title: "Статистика",
    description: "Сводка по пользователям, платежам, доменам и общей активности.",
  },
  {
    href: "/admin/users",
    title: "Пользователи",
    description: "Поиск, просмотр аккаунтов, логинов, ящиков и писем.",
  },
  {
    href: "/admin/domains",
    title: "Домены",
    description: "Управление tier/status, лимитами и жизненным циклом доменов.",
  },
  {
    href: "/admin/payments",
    title: "Платежи",
    description: "Ручное подтверждение, провайдеры оплаты и история payment flow.",
  },
  {
    href: "/admin/withdrawals",
    title: "Выводы (рефералка)",
    description: "Очередь withdrawal, статусы выплат и корректировка referral balance.",
  },
  {
    href: "/admin/referrals",
    title: "Рефералы",
    description: "Топ рефереров, бонусы, отвязка и ручные корректировки.",
  },
  {
    href: "/admin/load",
    title: "Нагрузка",
    description: "Мониторинг очередей, SLA и текущих сервисных метрик.",
  },
  {
    href: "/admin/site",
    title: "Настройки сайта",
    description: "Глобальные флаги, техработы, support и параметры запуска на VPS.",
  },
  {
    href: "/admin/contacts",
    title: "Контакты",
    description: "Telegram support и другие публичные каналы связи проекта.",
  },
] as const;

export default async function AdminHomePage() {
  const adminSuperKey = process.env.ADMIN_SUPER_KEY;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const adminCookie = cookieStore.get("akm_admin")?.value;
  const adminHeader = headerStore.get("x-admin-key");
  const hasAccess =
    !!adminSuperKey &&
    (adminCookie === adminSuperKey || adminHeader === adminSuperKey);

  if (!hasAccess) {
    redirect("/admin/auth");
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <Card className="space-y-3 rounded-2xl border-border bg-card/95 p-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">
            Admin control center
          </p>
          <h1 className="text-3xl font-semibold">Админ-панель Time-Email</h1>
          <p className="max-w-3xl text-sm text-muted">
            Единая точка управления privacy-first почтой: пользователи, домены,
            рефералка, выплаты, платежи, нагрузка и глобальные настройки.
          </p>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminSections.map((section) => (
          <Link key={section.href} href={section.href} className="group block">
            <Card className="h-full rounded-2xl border-border bg-card/80 p-5 transition hover:border-violet-500 hover:bg-card">
              <div className="space-y-2">
                <h2 className="text-lg font-medium transition group-hover:text-violet-300">
                  {section.title}
                </h2>
                <p className="text-sm text-muted">{section.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
