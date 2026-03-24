import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const siteSettingFields = [
  {
    key: "tech_works",
    label: "Техработы",
    type: "boolean",
    description: "Глобальный баннер и режим техработ.",
  },
  {
    key: "telegram_support",
    label: "Telegram support",
    type: "text",
    placeholder: "https://t.me/your_support",
  },
  {
    key: "manual_monero_wallet",
    label: "Manual Monero wallet",
    type: "text",
    placeholder: "4...",
  },
  {
    key: "min_withdrawal_usd",
    label: "Минимальный вывод, USD",
    type: "number",
    placeholder: "50",
  },
  {
    key: "startup_bonus_enabled",
    label: "Стартовый бонус включён",
    type: "boolean",
    description: "Выдавать бонус новым пользователям при регистрации.",
  },
  {
    key: "startup_bonus_usd",
    label: "Стартовый бонус, USD",
    type: "number",
    placeholder: "2",
  },
  {
    key: "support_email",
    label: "Support email",
    type: "text",
    placeholder: "support@example.com",
  },
] as const;

async function saveSiteSettingsAction(formData: FormData) {
  "use server";

  await requireAdminPage();

  for (const field of siteSettingFields) {
    const rawValue = formData.get(field.key);
    const value =
      field.type === "boolean"
        ? rawValue === "on"
          ? "true"
          : "false"
        : String(rawValue || "").trim();

    await prisma.globalSetting.upsert({
      where: { key: field.key },
      update: { value, description: field.label },
      create: { key: field.key, value, description: field.label },
    });
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/admin/site");
  revalidatePath("/admin/contacts");
}

export default async function AdminSitePage() {
  await requireAdminPage();
  const settings = await prisma.globalSetting.findMany({
    where: { key: { in: siteSettingFields.map((item) => item.key) } },
  });
  const settingMap = new Map(settings.map((item) => [item.key, item.value]));

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Админка / Настройки сайта</h1>
          <p className="mt-2 text-sm text-muted">
            Управление глобальными настройками, которые нужны для VPS-запуска:
            техработы, support и параметры вывода.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted underline">
          Назад в админку
        </Link>
      </div>

      <Card>
        <form action={saveSiteSettingsAction} className="space-y-5">
          {siteSettingFields.map((field) => {
            const value = settingMap.get(field.key) || "";

            if (field.type === "boolean") {
              return (
                <label
                  key={field.key}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-zinc-900 p-4"
                >
                  <div>
                    <p className="font-medium">{field.label}</p>
                    <p className="text-sm text-muted">{field.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    name={field.key}
                    defaultChecked={value === "true"}
                    className="mt-1 h-5 w-5 rounded border border-border bg-zinc-950"
                  />
                </label>
              );
            }

            return (
              <div key={field.key}>
                <label className="mb-1 block text-sm text-muted">
                  {field.label}
                </label>
                <Input
                  name={field.key}
                  type={field.type}
                  step={field.type === "number" ? "0.01" : undefined}
                  defaultValue={value}
                  placeholder={field.placeholder}
                />
              </div>
            );
          })}

          <Button>Сохранить настройки</Button>
        </form>
      </Card>
    </main>
  );
}
