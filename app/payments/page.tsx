"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PaymentRow = {
  id: string;
  targetTier: "PREMIUM" | "UNLIMITED";
  plan: "PREMIUM_MONTHLY" | "UNLIMITED_LIFETIME";
  method: string;
  status: string;
  amountUsd: string;
  currency: string;
  retryCount: number;
};

type PlanKey = "PREMIUM_MONTHLY" | "UNLIMITED_LIFETIME";
type MethodKey = "TELEGRAM_STARS" | "CRYPTOBOT" | "MONERO" | "MANUAL";

const plans = {
  PREMIUM_MONTHLY: {
    targetTier: "PREMIUM" as const,
    title: "Premium / 30 дней",
    price: 9.99,
    highlight:
      "До 20 активных ящиков, ручной username/domain, расширенные сроки",
  },
  UNLIMITED_LIFETIME: {
    targetTier: "UNLIMITED" as const,
    title: "Unlimited / lifetime",
    price: 149,
    highlight: "До 100 ящиков, год истории, lifetime-апгрейд без продлений",
  },
};

const methods: Array<{ key: MethodKey; label: string }> = [
  { key: "TELEGRAM_STARS", label: "Telegram Stars" },
  { key: "CRYPTOBOT", label: "CryptoBot" },
  { key: "MONERO", label: "Monero" },
  { key: "MANUAL", label: "Ручной перевод" },
];

export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [msg, setMsg] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("PREMIUM_MONTHLY");
  const referralAmount = searchParams.get("amount") || "";

  async function load() {
    const res = await fetch("/api/payments/list");
    if (!res.ok) return;
    const data = await res.json();
    setPayments(data.payments || []);
  }

  async function create(method: MethodKey) {
    const current = plans[selectedPlan];
    const res = await fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        plan: selectedPlan,
        targetTier: current.targetTier,
        amountUsd: current.price,
        currency: "USD",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(
      res.ok
        ? `Платёж создан: ${data.payment.id}`
        : data.error || data.details || "Ошибка",
    );
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedMeta = useMemo(() => plans[selectedPlan], [selectedPlan]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Платежи / Апгрейд</h1>
      {referralAmount ? (
        <Card>
          <p className="text-sm text-muted">
            Вы перешли из реферального баланса. Доступно для расходования:{" "}
            {referralAmount} USD.
          </p>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          Object.entries(plans) as Array<[PlanKey, (typeof plans)[PlanKey]]>
        ).map(([plan, meta]) => (
          <Card
            key={plan}
            className={selectedPlan === plan ? "border-violet-500" : ""}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{meta.title}</h2>
                <p className="mt-2 text-sm text-muted">{meta.highlight}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${meta.price}</p>
                <p className="text-xs text-muted">USD</p>
              </div>
            </div>
            <Button className="mt-4" onClick={() => setSelectedPlan(plan)}>
              {selectedPlan === plan ? "Выбрано" : "Выбрать план"}
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Способ оплаты</h2>
        <p className="mb-4 text-sm text-muted">
          Выбран план: {selectedMeta.title}. Целевой тариф:{" "}
          {selectedMeta.targetTier}.
        </p>
        <div className="flex flex-wrap gap-2">
          {methods.map((method) => (
            <Button
              key={method.key}
              className={method.key === "TELEGRAM_STARS" ? "" : "bg-zinc-700"}
              onClick={() => create(method.key)}
            >
              {method.label}
            </Button>
          ))}
        </div>
        {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg">История платежей</h2>
        <div className="space-y-2 text-sm">
          {payments.map((p) => (
            <div
              key={p.id}
              className="rounded border border-border bg-zinc-900 p-3"
            >
              <div className="font-medium">{p.id}</div>
              <div>
                План: {p.plan} → {p.targetTier}
              </div>
              <div>
                {p.method} / {p.status} / {p.amountUsd} {p.currency}
              </div>
              <div className="text-muted">retryCount: {p.retryCount}</div>
            </div>
          ))}
          {!payments.length ? (
            <div className="text-muted">Платежей пока нет</div>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
