"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Mailbox = {
  id: string;
  address: string;
  isActive: boolean;
  expiresAt: string;
};

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/mailboxes");
    if (!res.ok) return;
    const data = await res.json();
    setMailboxes(data.mailboxes || []);
  }

  async function createRandom() {
    const res = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ random: true, extendMinutes: 30 })
    });

    const data = await res.json();
    setMessage(res.ok ? `Создан: ${data.mailbox.address}` : data.error || "Ошибка");
    await refresh();
  }

  async function extendBox(mailboxId: string) {
    const res = await fetch("/api/mailboxes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailboxId, minutes: 30 })
    });
    const data = await res.json();
    setMessage(res.ok ? `Продлён: ${data.mailbox.address}` : data.error || "Ошибка продления");
    await refresh();
  }

  async function removeBox(mailboxId: string) {
    const res = await fetch("/api/mailboxes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailboxId })
    });
    const data = await res.json();
    setMessage(res.ok ? "Ящик деактивирован" : data.error || "Ошибка удаления");
    await refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Мои ящики</h1>
      <Card>
        <div className="flex gap-2">
          <Button onClick={createRandom}>Создать случайный ящик</Button>
          <Button className="bg-zinc-700" onClick={refresh}>Обновить</Button>
        </div>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </Card>

      <Card>
        <div className="space-y-3">
          {mailboxes.map((m) => (
            <div key={m.id} className="rounded border border-border bg-zinc-900 p-3">
              <div className="font-mono">{m.address}</div>
              <div className="text-sm text-muted">Истекает: {new Date(m.expiresAt).toLocaleString()}</div>
              <div className="mt-2 flex gap-2">
                <Button className="bg-zinc-700" onClick={() => extendBox(m.id)}>+30 минут</Button>
                <Button className="bg-red-800" onClick={() => removeBox(m.id)}>Удалить</Button>
              </div>
            </div>
          ))}
          {!mailboxes.length ? <p className="text-sm text-muted">Ящиков пока нет.</p> : null}
        </div>
      </Card>
    </main>
  );
}
