"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tier } from "@prisma/client";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AdminUserRecord = {
  id: string;
  publicId: string;
  tier: Tier;
  deletionInterval: string;
  deleteAt: string;
  createdAt: string;
  referralBalance: string;
  stats: {
    mailboxCount: number;
    loginLogCount: number;
    emailCount: number;
    referralCount: number;
    paymentsCount: number;
    earnedReferralBonusUsd: string;
  };
  mailboxes: Array<{
    id: string;
    address: string;
    expiresAt: string;
    createdAt: string;
    domainName: string;
    emails: Array<{
      id: string;
      fromAddress: string;
      subject: string;
      receivedAt: string;
      mailboxId: string;
      mailboxAddress: string;
      textBody: string;
    }>;
  }>;
  loginLogs: Array<{
    id: string;
    ip: string;
    createdAt: string;
    userAgent: string | null;
  }>;
};

export default function UsersClient({
  initialUsers,
  initialQuery,
  tierOptions,
}: {
  initialUsers: AdminUserRecord[];
  initialQuery: string;
  tierOptions: Tier[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [tierDrafts, setTierDrafts] = useState<Record<string, Tier>>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.id, user.tier])),
  );

  useEffect(() => {
    setTierDrafts(Object.fromEntries(initialUsers.map((user) => [user.id, user.tier])));
  }, [initialUsers]);

  useEffect(() => {
    const trimmed = query.trim();
    const current = searchParams.get("q") || "";

    if (trimmed.length > 0 && trimmed.length < 5) {
      return;
    }

    const timer = setTimeout(() => {
      if (trimmed === current) return;

      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }

      startTransition(() => {
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
        router.refresh();
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [pathname, query, router, searchParams]);

  const filteredEmails = useMemo(() => {
    if (!selectedUser) return [];
    const mailboxIds = selectedMailboxId ? new Set([selectedMailboxId]) : null;
    const search = emailSearch.trim().toLowerCase();

    return selectedUser.mailboxes
      .filter((mailbox) => (mailboxIds ? mailboxIds.has(mailbox.id) : true))
      .flatMap((mailbox) => mailbox.emails)
      .filter((email) => {
        if (!search) return true;
        return [email.subject, email.fromAddress, email.mailboxAddress]
          .some((value) => value.toLowerCase().includes(search));
      });
  }, [emailSearch, selectedMailboxId, selectedUser]);

  const mutateUser = async (payload: Record<string, string>) => {
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error || "Не удалось выполнить действие.");
      return;
    }
    setMessage(data?.message || "Изменения сохранены.");
    router.refresh();
  };

  const deleteForever = async (userId: string) => {
    const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error || "Не удалось удалить пользователя.");
      return;
    }
    setSelectedUser(null);
    setMessage("Пользователь удалён навсегда.");
    router.refresh();
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Админка / Пользователи</h1>
        <p className="text-sm text-muted">
          Поиск по publicId от 5 символов с debounce, управление блокировкой, tier
          и просмотр всей пользовательской активности.
        </p>
      </div>

      <Card className="space-y-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите publicId (минимум 5 символов)"
        />
        <p className="text-xs text-muted">
          {query.trim().length > 0 && query.trim().length < 5
            ? "Введите ещё символы: поиск стартует от 5 символов."
            : pending
              ? "Поиск выполняется..."
              : "Результаты обновляются автоматически."}
        </p>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>publicId</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>deletionInterval</TableHead>
              <TableHead>deleteAt</TableHead>
              <TableHead>createdAt</TableHead>
              <TableHead className="w-[360px]">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialUsers.map((user) => {
              const isBlocked = new Date(user.deleteAt).getTime() <= Date.now() + 24 * 60 * 60 * 1000;
              return (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedUser(user)}
                >
                  <TableCell>
                    <div className="font-medium">{user.publicId}</div>
                    <div className="text-xs text-muted">{user.id}</div>
                  </TableCell>
                  <TableCell>{user.tier}</TableCell>
                  <TableCell>{user.deletionInterval}</TableCell>
                  <TableCell>{new Date(user.deleteAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <Button
                        className={isBlocked ? "bg-emerald-600" : "bg-amber-600"}
                        onClick={() =>
                          mutateUser({
                            action: isBlocked ? "unblock" : "block",
                            userId: user.id,
                          })
                        }
                      >
                        {isBlocked ? "Unblock" : "Block"}
                      </Button>
                      <Select
                        value={tierDrafts[user.id] || user.tier}
                        onValueChange={(value) =>
                          setTierDrafts((current) => ({
                            ...current,
                            [user.id]: value as Tier,
                          }))
                        }
                        options={tierOptions.map((tier) => ({ label: tier, value: tier }))}
                        className="w-[160px]"
                      />
                      <Button
                        onClick={() =>
                          mutateUser({
                            action: "change-tier",
                            userId: user.id,
                            tier: tierDrafts[user.id] || user.tier,
                          })
                        }
                      >
                        Save tier
                      </Button>
                      <Button className="bg-red-700" onClick={() => deleteForever(user.id)}>
                        Delete forever
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!initialUsers.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted">
                  {initialQuery.trim().length >= 5
                    ? "Ничего не найдено по текущему publicId."
                    : "Введите минимум 5 символов publicId для запуска поиска."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
            setSelectedMailboxId("");
            setEmailSearch("");
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          {selectedUser ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedUser.publicId}</DialogTitle>
                <DialogDescription>
                  Tier {selectedUser.tier} · автоудаление {selectedUser.deletionInterval} ·
                  deleteAt {new Date(selectedUser.deleteAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="mailboxes">
                <TabsList>
                  <TabsTrigger value="mailboxes">Mailbox</TabsTrigger>
                  <TabsTrigger value="login-logs">LoginLog</TabsTrigger>
                  <TabsTrigger value="emails">Emails</TabsTrigger>
                  <TabsTrigger value="stats">Stats</TabsTrigger>
                </TabsList>

                <TabsContent value="mailboxes">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Адрес</TableHead>
                        <TableHead>Домен</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Создан</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedUser.mailboxes.map((mailbox) => (
                        <TableRow key={mailbox.id}>
                          <TableCell className="font-medium">{mailbox.address}</TableCell>
                          <TableCell>{mailbox.domainName}</TableCell>
                          <TableCell>{new Date(mailbox.expiresAt).toLocaleString()}</TableCell>
                          <TableCell>{new Date(mailbox.createdAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {!selectedUser.mailboxes.length ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted">
                            У пользователя пока нет ящиков.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="login-logs">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP</TableHead>
                        <TableHead>User-Agent</TableHead>
                        <TableHead>Дата</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedUser.loginLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono">{log.ip}</TableCell>
                          <TableCell className="max-w-[320px] break-words text-xs text-muted">
                            {log.userAgent || "—"}
                          </TableCell>
                          <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {!selectedUser.loginLogs.length ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted">
                            Нет логов входа.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="emails" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
                    <Select
                      value={selectedMailboxId}
                      onValueChange={setSelectedMailboxId}
                      placeholder="Все mailbox"
                      options={selectedUser.mailboxes.map((mailbox) => ({
                        label: mailbox.address,
                        value: mailbox.id,
                      }))}
                    />
                    <Input
                      value={emailSearch}
                      onChange={(event) => setEmailSearch(event.target.value)}
                      placeholder="Поиск по subject / from"
                    />
                  </div>

                  <div className="grid gap-3">
                    {filteredEmails.map((email) => (
                      <div key={email.id} className="rounded-lg border border-border bg-zinc-900 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{email.subject || "(без темы)"}</p>
                            <p className="text-xs text-muted">
                              {email.fromAddress} → {email.mailboxAddress}
                            </p>
                          </div>
                          <span className="text-xs text-muted">
                            {new Date(email.receivedAt).toLocaleString()}
                          </span>
                        </div>
                        {email.textBody ? (
                          <p className="mt-3 line-clamp-4 text-sm text-muted">{email.textBody}</p>
                        ) : null}
                      </div>
                    ))}
                    {!filteredEmails.length ? (
                      <p className="text-sm text-muted">Письма по заданным фильтрам не найдены.</p>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="stats">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Card>
                      <p className="text-sm text-muted">Ящиков</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.stats.mailboxCount}</p>
                    </Card>
                    <Card>
                      <p className="text-sm text-muted">Писем</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.stats.emailCount}</p>
                    </Card>
                    <Card>
                      <p className="text-sm text-muted">Рефералов</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.stats.referralCount}</p>
                    </Card>
                    <Card>
                      <p className="text-sm text-muted">LoginLog</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.stats.loginLogCount}</p>
                    </Card>
                    <Card>
                      <p className="text-sm text-muted">Платежей</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.stats.paymentsCount}</p>
                    </Card>
                    <Card>
                      <p className="text-sm text-muted">Referral balance</p>
                      <p className="mt-2 text-3xl font-semibold">{selectedUser.referralBalance} USD</p>
                    </Card>
                    <Card className="md:col-span-2 xl:col-span-3">
                      <p className="text-sm text-muted">Заработано по рефералке</p>
                      <p className="mt-2 text-3xl font-semibold">
                        {selectedUser.stats.earnedReferralBonusUsd} USD
                      </p>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button className="bg-zinc-700" onClick={() => setSelectedUser(null)}>
                  Закрыть
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
