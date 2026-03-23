import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const contactKeys = [
  {
    key: "telegram_support",
    label: "Telegram support",
    placeholder: "https://t.me/your_support",
  },
  {
    key: "support_email",
    label: "Support email",
    placeholder: "support@example.com",
  },
  {
    key: "discord_support",
    label: "Discord",
    placeholder: "https://discord.gg/...",
  },
  {
    key: "x_support",
    label: "X / Twitter",
    placeholder: "https://x.com/...",
  },
  {
    key: "other_socials_json",
    label: "Другие соцсети (JSON)",
    placeholder: '{"youtube":"https://youtube.com/..."}',
  },
] as const;

async function saveContactsAction(formData: FormData) {
  "use server";

  await requireAdminPage();

  for (const item of contactKeys) {
    const value = String(formData.get(item.key) || "").trim();
    await prisma.globalSetting.upsert({
      where: { key: item.key },
      update: { value, description: `Contact: ${item.label}` },
      create: { key: item.key, value, description: `Contact: ${item.label}` },
    });
  }

  revalidatePath("/admin/contacts");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export default async function AdminContactsPage() {
  await requireAdminPage();
  const settings = await prisma.globalSetting.findMany({
    where: { key: { in: contactKeys.map((item) => item.key) } },
  });
  const map = new Map(settings.map((item) => [item.key, item.value]));

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Админка / Контакты</h1>
          <p className="mt-2 text-sm text-muted">
            Управление `telegram_support` и другими публичными контактами проекта.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted underline">
          Назад в админку
        </Link>
      </div>

      <Card>
        <form action={saveContactsAction} className="space-y-4">
          {contactKeys.map((item) => (
            <div key={item.key}>
              <label className="mb-1 block text-sm text-muted">{item.label}</label>
              <Input
                name={item.key}
                defaultValue={map.get(item.key) || ""}
                placeholder={item.placeholder}
              />
            </div>
          ))}
          <Button>Сохранить контакты</Button>
        </form>
      </Card>
    </main>
  );
}
