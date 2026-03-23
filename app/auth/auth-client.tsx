"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const deletionOptions = [
  { value: "D1", label: "1 день" },
  { value: "D5", label: "5 дней" },
  { value: "D10", label: "10 дней" },
  { value: "D30", label: "30 дней" },
  { value: "D90", label: "90 дней" },
  { value: "D180", label: "180 дней" },
  { value: "Y1", label: "1 год" },
] as const;

export default function AuthClient({
  referralCode,
}: {
  referralCode?: string;
}) {
  const router = useRouter();
  const [interval, setIntervalValue] = useState("D30");
  const [ack, setAck] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [loginKey, setLoginKey] = useState("");
  const [loading, setLoading] = useState<"register" | "login" | null>(null);

  const registerEndpoint = useMemo(
    () =>
      referralCode
        ? `/api/auth/register-with-ref?ref=${encodeURIComponent(referralCode)}`
        : "/api/auth/register",
    [referralCode],
  );

  async function register() {
    setLoading("register");
    const res = await fetch(registerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletionInterval: interval, acknowledged: ack }),
    });
    const data = await res.json().catch(() => null);
    setLoading(null);

    if (!res.ok) {
      toast.error(data?.error || "Не удалось создать аккаунт");
      return;
    }

    if (data?.oneTimeKey) {
      setIssuedKey(data.oneTimeKey);
    }

    toast.success(
      referralCode
        ? "Аккаунт создан, реферальный код применён."
        : "Аккаунт создан.",
    );
  }

  async function login() {
    setLoading("login");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: loginKey }),
    });
    const data = await res.json().catch(() => null);
    setLoading(null);

    if (!res.ok) {
      toast.error(data?.error || "Не удалось войти");
      return;
    }

    toast.success("Сессия создана.");
    router.push("/dashboard");
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    toast.success("Сессия завершена.");
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Регистрация / вход по ключу</h1>

      {referralCode ? (
        <Card className="border-emerald-600/60 bg-emerald-950/30">
          <p className="text-sm text-emerald-300">
            Регистрация по реферальной ссылке:{" "}
            <span className="font-mono">{referralCode}</span>.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-lg">Регистрация</h2>
        <label className="block text-sm">Автоудаление аккаунта</label>
        <select
          className="w-full rounded-md border border-border bg-zinc-900 p-2"
          value={interval}
          onChange={(e) => setIntervalValue(e.target.value)}
        >
          {deletionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          Я сохранил ключ
        </label>

        <div className="rounded-md border border-red-600 bg-red-950 p-3 text-sm text-red-100">
          Ключ больше никогда не будет показан. Потеря ключа = полная и
          безвозвратная потеря аккаунта.
        </div>

        <Button disabled={!ack || loading === "register"} onClick={register}>
          {loading === "register"
            ? "Создание..."
            : "Создать аккаунт и получить ключ"}
        </Button>

        {issuedKey ? (
          <div className="rounded-md border border-border bg-zinc-900 p-3 font-mono text-lg">
            {issuedKey}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Вход</h2>
        <input
          className="w-full rounded-md border border-border bg-zinc-900 p-2"
          value={loginKey}
          onChange={(e) => setLoginKey(e.target.value)}
          placeholder="Вставьте ключ"
        />
        <div className="flex gap-2">
          <Button disabled={!loginKey || loading === "login"} onClick={login}>
            {loading === "login" ? "Вход..." : "Войти"}
          </Button>
          <Button className="bg-zinc-700" onClick={logout}>
            Выйти
          </Button>
        </div>
      </Card>
    </main>
  );
}
