"use client";

import { useState } from "react";
import { Tier } from "@prisma/client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StatsTierSlice = { name: string; value: number };
export type StatsUserSearchItem = { id: string; publicId: string; tier: Tier; deletionInterval: string; deleteAt: string; createdAt: string; };

const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];

export default function StatsClient({
  tierSlices,
  tierOptions,
  domainStats,
  initialUsers
}: {
  tierSlices: StatsTierSlice[];
  tierOptions: Tier[];
  domainStats: Array<{ id: string; name: string; totalMailboxes: number; activeMailboxes: number; tier: string }>;
  initialUsers: StatsUserSearchItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState(initialUsers);
  const [drafts, setDrafts] = useState<Record<string, Tier>>({});
  const [message, setMessage] = useState("");

  const searchUsers = async () => {
    if (search.trim().length < 5) {
      setMessage("Поиск пользователя доступен от 5 символов publicId.");
      return;
    }

    const response = await fetch(`/api/admin/users?q=${encodeURIComponent(search.trim())}`);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Не удалось выполнить поиск.");
      return;
    }
    setUsers(data.users || []);
    setMessage(`Найдено пользователей: ${data.users?.length || 0}`);
  };

  const changeTier = async (userId: string) => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change-tier", userId, tier: drafts[userId] })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Смена тарифа не выполнена.");
      return;
    }
    setMessage("Тариф пользователя обновлён.");
    router.refresh();
    await searchUsers();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-medium">Тарифы</h2>
          <ResponsiveContainer height={320}>
            <PieChart>
              <Pie data={tierSlices} dataKey="value" nameKey="name">
                {tierSlices.map((slice, index) => <Cell key={slice.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-medium">По каждому домену</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Домен</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Всего ящиков</TableHead>
                <TableHead>Активно</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domainStats.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-medium">{domain.name}</TableCell>
                  <TableCell>{domain.tier}</TableCell>
                  <TableCell>{domain.totalMailboxes}</TableCell>
                  <TableCell>{domain.activeMailboxes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Поиск пользователя + смена тарифа</h2>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="publicId пользователя" />
          <Button onClick={searchUsers}>Найти</Button>
        </div>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
        <div className="mt-4 space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded-lg border border-border bg-zinc-900 p-4">
              <div className="mb-3">
                <p className="font-medium">{user.publicId}</p>
                <p className="text-xs text-muted">{user.id}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                <div className="text-sm text-muted">Текущий тариф: {user.tier}</div>
                <Select value={drafts[user.id] || user.tier} onValueChange={(value) => setDrafts((current) => ({ ...current, [user.id]: value as Tier }))} options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
                <Button onClick={() => changeTier(user.id)}>Change tier</Button>
              </div>
            </div>
          ))}
          {!users.length ? <p className="text-sm text-muted">Список пуст. Выполните поиск пользователя.</p> : null}
        </div>
      </Card>
    </div>
  );
}
