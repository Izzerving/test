"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminAuthPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");

  async function login() {
    const res = await fetch("/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Ошибка доступа");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Вход в админ-панель</h1>
      <Card>
        <p className="mb-3 text-sm text-muted">Доступ по SUPER KEY согласно ТЗ.</p>
        <input
          type="password"
          placeholder="ADMIN_SUPER_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
        />
        <Button className="mt-3" onClick={login}>Войти</Button>
        {msg ? <p className="mt-2 text-sm text-red-400">{msg}</p> : null}
      </Card>
    </main>
  );
}
