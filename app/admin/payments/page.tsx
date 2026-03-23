import {
  PaymentMethod,
  PaymentPlan,
  PaymentStatus,
  Tier,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { confirmPaymentAndApplyReferral } from "@/lib/server/referrals";
import { requireAdminPage } from "@/lib/server/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const toggleRows = [
  { key: "payments.telegram_stars.enabled", label: "TELEGRAM_STARS" },
  { key: "payments.cryptobot.enabled", label: "CRYPTOBOT" },
  { key: "payments.monero.enabled", label: "MONERO" },
  { key: "tech_works", label: "Техработы" },
] as const;

async function upsertSetting(key: string, value: string, description?: string) {
  await prisma.globalSetting.upsert({
    where: { key },
    update: { value, description },
    create: { key, value, description },
  });
}

async function toggleSettingAction(formData: FormData) {
  "use server";

  await requireAdminPage();
  const key = String(formData.get("key") || "");
  const next = String(formData.get("next") || "false");
  if (!key) return;

  await upsertSetting(key, next, "Admin payment / maintenance toggle");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/site");
  revalidatePath("/");
}

async function createManualPaymentAction(formData: FormData) {
  "use server";

  await requireAdminPage();

  const userId = String(formData.get("userId") || "");
  const targetTier = String(formData.get("targetTier") || Tier.PREMIUM) as Tier;
  const amountUsd = Number(formData.get("amountUsd") || 0);
  const wallet = String(formData.get("wallet") || "").trim();
  const memo = String(formData.get("memo") || "").trim();

  if (!userId || !wallet || !memo || !amountUsd) return;

  const plan =
    targetTier === Tier.UNLIMITED
      ? PaymentPlan.UNLIMITED_LIFETIME
      : PaymentPlan.PREMIUM_MONTHLY;

  await prisma.payment.create({
    data: {
      userId,
      targetTier,
      plan,
      method: PaymentMethod.MANUAL,
      status: PaymentStatus.PENDING,
      amountUsd,
      currency: "USD",
      externalId: `manual_${Date.now()}`,
      memo: `wallet:${wallet}; memo:${memo}`,
    },
  });

  revalidatePath("/admin/payments");
}

async function confirmManualPaymentAction(formData: FormData) {
  "use server";

  await requireAdminPage();
  const paymentId = String(formData.get("paymentId") || "");
  if (!paymentId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  await confirmPaymentAndApplyReferral(payment.id);

  revalidatePath("/admin/payments");
  revalidatePath("/dashboard");
}

export default async function AdminPaymentsPage() {
  await requireAdminPage();

  const [payments, users, settings] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            publicId: true,
            tier: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, publicId: true, tier: true },
    }),
    prisma.globalSetting.findMany({
      where: { key: { in: toggleRows.map((item) => item.key) } },
    }),
  ]);

  const settingMap = new Map(
    settings.map((setting) => [setting.key, setting.value === "true"]),
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Админка / Платежи</h1>
          <p className="mt-2 text-sm text-muted">
            Вкл/выкл провайдеров оплаты, manual payment, ручное подтверждение и
            глобальный режим техработ.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted underline">
          Назад в админку
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-medium">Тогглы оплаты и сайта</h2>
          <div className="space-y-3">
            {toggleRows.map((toggle) => {
              const enabled = settingMap.get(toggle.key) ?? false;
              return (
                <form
                  key={toggle.key}
                  action={toggleSettingAction}
                  className="flex items-center justify-between rounded-lg border border-border bg-zinc-900 p-4"
                >
                  <input type="hidden" name="key" value={toggle.key} />
                  <input type="hidden" name="next" value={String(!enabled)} />
                  <div>
                    <p className="font-medium">{toggle.label}</p>
                    <p className="text-xs text-muted">
                      Текущее состояние: {enabled ? "включено" : "выключено"}
                    </p>
                  </div>
                  <Button
                    className={enabled ? "bg-emerald-600" : "bg-zinc-700"}
                  >
                    {enabled ? "Выключить" : "Включить"}
                  </Button>
                </form>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-medium">Manual payment</h2>
          <form action={createManualPaymentAction} className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted">
                Пользователь
              </label>
              <select
                name="userId"
                className="flex h-10 w-full rounded-md border border-border bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.publicId} · {user.tier}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted">
                  Сумма, USD
                </label>
                <Input
                  name="amountUsd"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue="9.99"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">
                  Целевой tier
                </label>
                <select
                  name="targetTier"
                  className="flex h-10 w-full rounded-md border border-border bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value={Tier.PREMIUM}>PREMIUM</option>
                  <option value={Tier.UNLIMITED}>UNLIMITED</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted">Метод</label>
                <Input value={PaymentMethod.MANUAL} readOnly />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">
                  Wallet (Monero)
                </label>
                <Input name="wallet" placeholder="4... Monero wallet" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">Memo code</label>
              <Input name="memo" placeholder="manual-order-001" />
            </div>
            <Button>Создать manual payment</Button>
          </form>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Все Payment</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <div className="font-medium">{payment.id}</div>
                  <div className="text-xs text-muted">{payment.plan}</div>
                </TableCell>
                <TableCell>
                  <div>{payment.user.publicId}</div>
                  <div className="text-xs text-muted">{payment.user.tier}</div>
                </TableCell>
                <TableCell>{payment.method}</TableCell>
                <TableCell>{payment.status}</TableCell>
                <TableCell>{payment.targetTier}</TableCell>
                <TableCell>
                  {payment.amountUsd.toString()} {payment.currency}
                </TableCell>
                <TableCell className="max-w-[240px] break-words text-xs text-muted">
                  {payment.memo || "—"}
                </TableCell>
                <TableCell>
                  {payment.method === PaymentMethod.MANUAL &&
                  payment.status !== PaymentStatus.CONFIRMED ? (
                    <form action={confirmManualPaymentAction}>
                      <input
                        type="hidden"
                        name="paymentId"
                        value={payment.id}
                      />
                      <Button className="bg-emerald-600">
                        Подтвердить вручную
                      </Button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
