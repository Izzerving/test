"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Gift, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TopReferrer = {
  id: string;
  publicId: string;
  tier: string;
  referralBalance: string;
  referralCount: number;
  bonusCount: number;
  totalEarnedUsd: string;
};

type ReferralBonusRow = {
  id: string;
  type: string;
  amountUsd: string;
  createdAt: string;
  fromPaymentId: string | null;
  referrer: { id: string; publicId: string; tier: string };
  referred: { id: string; publicId: string; tier: string };
};

type ReferralResponse = {
  topReferrers: TopReferrer[];
  bonuses: ReferralBonusRow[];
  totals: { totalBonusUsd: string; totalBonuses: number };
};

export default function AdminReferralsPage() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<TopReferrer | null>(null);
  const [balanceDelta, setBalanceDelta] = useState("0");
  const [selectedReferral, setSelectedReferral] = useState<ReferralBonusRow | null>(null);

  const groupedTop = useMemo(() => data?.topReferrers || [], [data]);

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/admin/referrals", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось загрузить рефералки.");
      setLoading(false);
      return;
    }
    setData(payload);
    setLoading(false);
  }

  async function adjustBalance() {
    if (!selectedUser) return;
    const response = await fetch("/api/admin/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust-balance", userId: selectedUser.id, amountUsd: Number(balanceDelta || 0) })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось обновить баланс.");
      return;
    }
    setMessage(`Баланс ${selectedUser.publicId} обновлён до ${payload.referralBalance} USD.`);
    setSelectedUser(null);
    setBalanceDelta("0");
    await loadData();
  }

  async function removeReferral(referredUserId: string) {
    const response = await fetch("/api/admin/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-referral", referredUserId })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось удалить реферала.");
      return;
    }
    setSelectedReferral(null);
    setMessage("Реферал отвязан, бонусы по нему удалены, баланс пересчитан.");
    await loadData();
  }

  async function deleteBonus(bonusId: string) {
    const response = await fetch("/api/admin/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-bonus", bonusId })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось удалить бонус.");
      return;
    }
    setMessage("ReferralBonus удалён, баланс реферера уменьшен.");
    await loadData();
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!message) return;
    toast.info(message);
  }, [message]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Gift className="h-6 w-6" />Админка / Рефералки</h1>
          <p className="mt-2 text-sm text-muted">Топ-рефереры, общий заработок, таблица всех ReferralBonus, удаление рефералов и ручная корректировка referralBalance.</p>
        </div>
        <Link href="/admin" className="text-sm text-muted underline">Назад в админку</Link>
      </div>

      {message ? <Card><p className="text-sm text-muted">{message}</p></Card> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted"><Gift className="h-4 w-4" />Всего бонусов</p>
          <p className="mt-2 text-3xl font-semibold">{data?.totals.totalBonuses || 0}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted"><TrendingUp className="h-4 w-4" />Общий заработок</p>
          <p className="mt-2 text-3xl font-semibold">{data?.totals.totalBonusUsd || "0.00"} USD</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" />Топ-рефереров</p>
          <p className="mt-2 text-3xl font-semibold">{groupedTop.length}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Топ-рефереры</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Рефералы</TableHead>
              <TableHead>Бонусы</TableHead>
              <TableHead>Всего заработал</TableHead>
              <TableHead>Баланс</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.topReferrers || []).map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">{user.publicId}</div>
                  <div className="text-xs text-muted">{user.id}</div>
                </TableCell>
                <TableCell>{user.tier}</TableCell>
                <TableCell>{user.referralCount}</TableCell>
                <TableCell>{user.bonusCount}</TableCell>
                <TableCell>{user.totalEarnedUsd} USD</TableCell>
                <TableCell>{user.referralBalance} USD</TableCell>
                <TableCell>
                  <Button className="bg-zinc-700" onClick={() => setSelectedUser(user)}>Изменить баланс</Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !(data?.topReferrers || []).length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted">Пока нет данных по рефералкам.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Все ReferralBonus</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Реферер</TableHead>
              <TableHead>Приведённый</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Платёж</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.bonuses || []).map((bonus) => (
              <TableRow key={bonus.id}>
                <TableCell>{new Date(bonus.createdAt).toLocaleString()}</TableCell>
                <TableCell>{bonus.type}</TableCell>
                <TableCell>{bonus.referrer.publicId} · {bonus.referrer.tier}</TableCell>
                <TableCell>{bonus.referred.publicId} · {bonus.referred.tier}</TableCell>
                <TableCell>{bonus.amountUsd} USD</TableCell>
                <TableCell className="max-w-[220px] break-all text-xs text-muted">{bonus.fromPaymentId || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button className="bg-amber-700" onClick={() => setSelectedReferral(bonus)}>Удалить реферала</Button>
                    <Button className="bg-red-700" onClick={() => void deleteBonus(bonus.id)}>Удалить бонус</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ручная корректировка баланса</DialogTitle>
            <DialogDescription>
              Можно ввести положительное число для начисления или отрицательное для списания. Пользователь: {selectedUser?.publicId || "—"}.
            </DialogDescription>
          </DialogHeader>
          <Input value={balanceDelta} onChange={(event) => setBalanceDelta(event.target.value)} type="number" step="0.01" placeholder="Например, 10 или -5" />
          <DialogFooter>
            <Button className="bg-zinc-700" onClick={() => setSelectedUser(null)}>Отмена</Button>
            <Button onClick={() => void adjustBalance()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedReferral)} onOpenChange={(open) => !open && setSelectedReferral(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Удаление реферала</DialogTitle>
            <DialogDescription>
              Это отвяжет пользователя {selectedReferral?.referred.publicId || "—"} от реферера, удалит все его ReferralBonus и пересчитает баланс.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="bg-zinc-700" onClick={() => setSelectedReferral(null)}>Отмена</Button>
            <Button className="bg-red-700" onClick={() => selectedReferral && void removeReferral(selectedReferral.referred.id)}>Удалить реферала</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
