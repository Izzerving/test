"use client";

import { useMemo, useState } from "react";
import { DomainStatus, DomainTier } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AdminDomainRecord = {
  id: string;
  name: string;
  tier: DomainTier;
  status: DomainStatus;
  maxMailboxes: number;
  currentMailboxes: number;
  dnsNs: string;
  transferAfterDays: number | null;
  transferToTier: DomainTier | null;
  createdAt: string;
  mailboxCount: number;
  userAccessCount: number;
};

export default function DomainsClient({ initialDomains, tierOptions }: { initialDomains: AdminDomainRecord[]; tierOptions: DomainTier[]; }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [mailboxCountFilter, setMailboxCountFilter] = useState("");
  const [form, setForm] = useState<{ name: string; tier: DomainTier; maxMailboxes: string; dnsNs: string; transferAfterDays: string; transferToTier: string }>({ name: "", tier: DomainTier.FREE, maxMailboxes: "500", dnsNs: "", transferAfterDays: "", transferToTier: "" });
  const [drafts, setDrafts] = useState<Record<string, { tier: DomainTier; dnsNs: string; maxMailboxes: string; transferAfterDays: string; transferToTier: string }>>(() => Object.fromEntries(initialDomains.map((domain) => [domain.id, { tier: domain.tier, dnsNs: domain.dnsNs, maxMailboxes: String(domain.maxMailboxes), transferAfterDays: domain.transferAfterDays ? String(domain.transferAfterDays) : "", transferToTier: domain.transferToTier ?? "" }])));

  const filteredDomains = useMemo(() => initialDomains.filter((domain) => {
    if (nameFilter && !domain.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (tierFilter && domain.tier !== tierFilter) return false;
    if (dateFilter && !domain.createdAt.startsWith(dateFilter)) return false;
    if (mailboxCountFilter && domain.mailboxCount < Number(mailboxCountFilter)) return false;
    return true;
  }), [dateFilter, initialDomains, mailboxCountFilter, nameFilter, tierFilter]);

  const mutate = async (url: string, init: RequestInit, successMessage: string) => {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Операция не выполнена.");
      return;
    }
    setMessage(successMessage);
    router.refresh();
  };

  const createDomain = async () => {
    await mutate("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        tier: form.tier,
        maxMailboxes: Number(form.maxMailboxes) || 500,
        dnsNs: form.dnsNs || undefined,
        transferAfterDays: form.transferAfterDays ? Number(form.transferAfterDays) : undefined,
        transferToTier: form.transferToTier || undefined
      })
    }, "Домен добавлен.");
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Админка / Домены</h1>
        <p className="text-sm text-muted">Все домены, привязка/перенос тарифа, DNS/NS, архивирование и авто-перенос через N дней.</p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Добавить домен</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="mail-premium.example.com" />
          <Select value={form.tier} onValueChange={(value) => setForm((current) => ({ ...current, tier: value as DomainTier }))} options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
          <Input value={form.maxMailboxes} onChange={(event) => setForm((current) => ({ ...current, maxMailboxes: event.target.value }))} placeholder="maxMailboxes" />
          <Input value={form.dnsNs} onChange={(event) => setForm((current) => ({ ...current, dnsNs: event.target.value }))} placeholder="DNS / NS" />
          <Input value={form.transferAfterDays} onChange={(event) => setForm((current) => ({ ...current, transferAfterDays: event.target.value }))} placeholder="Авто-перенос через N дней" />
          <Select value={form.transferToTier} onValueChange={(value) => setForm((current) => ({ ...current, transferToTier: value }))} placeholder="Куда переносить тариф" options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
        </div>
        <Button className="mt-4" onClick={createDomain}>Добавить домен</Button>
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      </Card>

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Фильтр по имени" />
          <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          <Input value={mailboxCountFilter} onChange={(event) => setMailboxCountFilter(event.target.value)} placeholder="Мин. кол-во ящиков" />
          <Select value={tierFilter} onValueChange={setTierFilter} placeholder="Все тарифы" options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Домен</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ящики</TableHead>
              <TableHead>Добавлен</TableHead>
              <TableHead>Настройки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDomains.map((domain) => {
              const draft = drafts[domain.id];
              return (
                <TableRow key={domain.id}>
                  <TableCell>
                    <div className="font-medium">{domain.name}</div>
                    <div className="text-xs text-muted">custom users: {domain.userAccessCount}</div>
                  </TableCell>
                  <TableCell>{domain.status}</TableCell>
                  <TableCell>{domain.mailboxCount} / {domain.maxMailboxes}</TableCell>
                  <TableCell>{new Date(domain.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="grid gap-2 xl:grid-cols-[150px_160px_140px_180px_auto_auto_auto]">
                      <Select value={draft?.tier || domain.tier} onValueChange={(value) => setDrafts((current) => ({ ...current, [domain.id]: { ...current[domain.id], tier: value as DomainTier } }))} options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
                      <Input value={draft?.dnsNs || ""} onChange={(event) => setDrafts((current) => ({ ...current, [domain.id]: { ...current[domain.id], dnsNs: event.target.value } }))} placeholder="DNS/NS" />
                      <Input value={draft?.maxMailboxes || String(domain.maxMailboxes)} onChange={(event) => setDrafts((current) => ({ ...current, [domain.id]: { ...current[domain.id], maxMailboxes: event.target.value } }))} placeholder="maxMailboxes" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={draft?.transferAfterDays || ""} onChange={(event) => setDrafts((current) => ({ ...current, [domain.id]: { ...current[domain.id], transferAfterDays: event.target.value } }))} placeholder="N дней" />
                        <Select value={draft?.transferToTier || ""} onValueChange={(value) => setDrafts((current) => ({ ...current, [domain.id]: { ...current[domain.id], transferToTier: value } }))} placeholder="Tier" options={tierOptions.map((tier) => ({ label: tier, value: tier }))} />
                      </div>
                      <Button onClick={() => mutate("/api/admin/domains", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", domainId: domain.id, tier: draft.tier, dnsNs: draft.dnsNs || undefined, maxMailboxes: Number(draft.maxMailboxes) || domain.maxMailboxes, transferAfterDays: draft.transferAfterDays ? Number(draft.transferAfterDays) : null, transferToTier: draft.transferToTier || null }) }, `Домен ${domain.name} обновлён.`)}>Сохранить</Button>
                      <Button className="bg-amber-700" onClick={() => mutate("/api/admin/domains", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", domainId: domain.id }) }, `Домен ${domain.name} архивирован.`)}>Archive</Button>
                      <Button className="bg-red-700" onClick={() => mutate("/api/admin/domains", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domainId: domain.id }) }, `Домен ${domain.name} удалён.`)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
