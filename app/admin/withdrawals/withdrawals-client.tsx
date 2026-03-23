"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck as CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type WithdrawalRow = {
  id: string;
  amountUsd: string;
  moneroAddress: string;
  memo: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
  user: {
    id: string;
    publicId: string;
    tier: string;
    referralBalance: string;
  };
};

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [message, setMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<
    WithdrawalRow["user"] | null
  >(null);
  const [balanceDelta, setBalanceDelta] = useState("0");

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (minAmount) params.set("minAmount", minAmount);
    if (maxAmount) params.set("maxAmount", maxAmount);

    const response = await fetch(
      `/api/admin/withdrawals?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось загрузить выводы.");
      return;
    }

    setWithdrawals(payload.withdrawals || []);
  }, [maxAmount, minAmount, statusFilter]);

  async function mutateWithdrawal(
    action: "approve" | "reject" | "paid",
    withdrawalId: string,
  ) {
    const response = await fetch("/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, withdrawalId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось обработать withdrawal.");
      return;
    }
    setMessage(
      action === "approve"
        ? "Withdrawal approved, уведомление поставлено в очередь ручной обработки."
        : action === "reject"
          ? "Withdrawal rejected."
          : "Withdrawal marked as paid, referralBalance уменьшен.",
    );
    await loadData();
  }

  async function adjustBalance() {
    if (!selectedUser) return;
    const response = await fetch("/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "adjust-balance",
        userId: selectedUser.id,
        amountUsd: Number(balanceDelta || 0),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Не удалось обновить баланс.");
      return;
    }
    setSelectedUser(null);
    setBalanceDelta("0");
    setMessage(
      `Баланс ${selectedUser.publicId} обновлён до ${payload.referralBalance} USD.`,
    );
    await loadData();
  }

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!message) return;
    toast.info(message);
  }, [message]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Wallet className="h-6 w-6" />
            Админка / Выводы
          </h1>
          <p className="mt-2 text-sm text-muted">
            Таблица Withdrawal, фильтры по сумме, статусы APPROVED / REJECTED /
            PAID и ручная корректировка referralBalance.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted underline">
          Назад в админку
        </Link>
      </div>

      {message ? (
        <Card>
          <p className="text-sm text-muted">{message}</p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-muted">Статус</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PAID">PAID</option>
              <option value="REJECTED">REJECTED</option>
              <option value="">Все</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Сумма от</label>
            <Input
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
              type="number"
              step="0.01"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Сумма до</label>
            <Input
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              type="number"
              step="0.01"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void loadData()}>Применить фильтры</Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Создан</TableHead>
              <TableHead>Пользователь</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Monero</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withdrawals.map((withdrawal) => (
              <TableRow key={withdrawal.id}>
                <TableCell>
                  <div>{new Date(withdrawal.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-muted">{withdrawal.id}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{withdrawal.user.publicId}</div>
                  <div className="text-xs text-muted">
                    {withdrawal.user.tier} · balance{" "}
                    {withdrawal.user.referralBalance} USD
                  </div>
                </TableCell>
                <TableCell>{withdrawal.amountUsd} USD</TableCell>
                <TableCell className="max-w-[220px] break-all text-xs">
                  {withdrawal.moneroAddress}
                </TableCell>
                <TableCell className="max-w-[220px] break-words text-xs text-muted">
                  {withdrawal.memo || "—"}
                </TableCell>
                <TableCell>{withdrawal.status}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {withdrawal.status === "PENDING" ? (
                      <Button
                        className="bg-emerald-700"
                        onClick={() =>
                          void mutateWithdrawal("approve", withdrawal.id)
                        }
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    ) : null}
                    {withdrawal.status !== "REJECTED" ? (
                      <Button
                        className="bg-red-700"
                        onClick={() =>
                          void mutateWithdrawal("reject", withdrawal.id)
                        }
                      >
                        Reject
                      </Button>
                    ) : null}
                    {withdrawal.status !== "PAID" ? (
                      <Button
                        className="bg-violet-700"
                        onClick={() =>
                          void mutateWithdrawal("paid", withdrawal.id)
                        }
                      >
                        Paid
                      </Button>
                    ) : null}
                    <Button
                      className="bg-zinc-700"
                      onClick={() => setSelectedUser(withdrawal.user)}
                    >
                      Баланс
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!withdrawals.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted">
                  По текущим фильтрам заявок нет.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование referralBalance</DialogTitle>
            <DialogDescription>
              Пользователь: {selectedUser?.publicId || "—"}. Укажите
              положительное число для начисления или отрицательное для списания.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={balanceDelta}
            onChange={(event) => setBalanceDelta(event.target.value)}
            type="number"
            step="0.01"
          />
          <DialogFooter>
            <Button
              className="bg-zinc-700"
              onClick={() => setSelectedUser(null)}
            >
              Отмена
            </Button>
            <Button onClick={() => void adjustBalance()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
