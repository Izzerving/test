"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type LoadPoint = { label: string; cpu: number; ram: number; disk: number };
export type LoadResponse = { current: { cpu: number; ram: number; disk: number }; history: LoadPoint[]; generatedAt: string };

function loadColor(value: number) {
  if (value >= 85) return "bg-red-500";
  if (value >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function LoadClient() {
  const [data, setData] = useState<LoadResponse | null>(null);
  const [message, setMessage] = useState("Загружаем системную нагрузку...");

  const load = async () => {
    const response = await fetch("/api/system/load", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Не удалось загрузить данные нагрузки.");
      return;
    }
    setData(payload);
    setMessage(`Обновлено: ${new Date(payload.generatedAt).toLocaleString()}`);
  };

  useEffect(() => {
    void load();
  }, []);

  const gauge = useMemo(() => data ? Math.round((data.current.cpu + data.current.ram + data.current.disk) / 3) : 0, [data]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Админка / Нагрузка</h1>
          <p className="text-sm text-muted">CPU, RAM, Disk за последние 24 часа, график и общая шкала нагрузки.</p>
        </div>
        <Button onClick={load}>Обновить</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-muted">CPU</p><p className="mt-2 text-3xl font-semibold">{data?.current.cpu ?? 0}%</p></Card>
        <Card><p className="text-sm text-muted">RAM</p><p className="mt-2 text-3xl font-semibold">{data?.current.ram ?? 0}%</p></Card>
        <Card><p className="text-sm text-muted">Disk</p><p className="mt-2 text-3xl font-semibold">{data?.current.disk ?? 0}%</p></Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Шкала нагрузки</h2>
            <p className="text-sm text-muted">Среднее значение по CPU, RAM и Disk.</p>
          </div>
          <span className="text-2xl font-semibold">{gauge}%</span>
        </div>
        <Progress value={gauge} indicatorClassName={loadColor(gauge)} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium">LineChart за последние 24 часа</h2>
        <ResponsiveContainer height={320}>
          <LineChart data={data?.history || []}>
            <CartesianGrid />
            <XAxis />
            <YAxis />
            <Tooltip />
            <Line dataKey="cpu" stroke="#22c55e" name="CPU" />
            <Line dataKey="ram" stroke="#3b82f6" name="RAM" />
            <Line dataKey="disk" stroke="#f59e0b" name="Disk" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Диаграмма последних точек</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(data?.history || []).slice(-3).map((point) => (
            <div key={point.label} className="rounded-lg border border-border bg-zinc-900 p-4">
              <p className="text-sm text-muted">{point.label}</p>
              <div className="mt-3 space-y-2 text-sm">
                <p>CPU: <span className="font-semibold">{point.cpu}%</span></p>
                <p>RAM: <span className="font-semibold">{point.ram}%</span></p>
                <p>Disk: <span className="font-semibold">{point.disk}%</span></p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">{message}</p>
      </Card>
    </main>
  );
}
