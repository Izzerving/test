"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TabKey =
  | "active"
  | "history"
  | "security"
  | "tariff"
  | "referrals"
  | "delete";
type UserTier = "FREE_GUEST" | "FREE_KEY" | "PREMIUM" | "UNLIMITED";

type UserInfo = {
  id?: string;
  publicId: string;
  tier: UserTier;
  deletionInterval: string;
  deleteAt?: string;
  referralCode?: string;
};

type MailboxRow = {
  id: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
};

type EmailRow = {
  id: string;
  fromAddress: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  receivedAt: string;
};

type AggregatedEmailRow = EmailRow & {
  mailboxId: string;
  mailboxAddress: string;
};

type DomainRow = {
  id: string;
  name: string;
};

type ReferralFriendRow = {
  id: string;
  publicId: string;
  tier: UserTier;
  joinedAt: string;
  totalPaymentsUsd: string;
  earnedUsd: string;
};

type ReferralBonusRow = {
  id: string;
  type: string;
  amountUsd: string;
  createdAt: string;
  referredPublicId: string;
  referredTier: UserTier;
};

type WithdrawalRow = {
  id: string;
  amountUsd: string;
  moneroAddress: string;
  memo: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
};

type ReferralSummary = {
  referralCode: string;
  referralLink: string;
  referralBalance: string;
  minWithdrawalUsd: string;
  referrals: ReferralFriendRow[];
  recentBonuses: ReferralBonusRow[];
  withdrawals: WithdrawalRow[];
};

type RealtimeEnvelope = {
  type?: string;
  replay?: Array<{ payload?: { type?: string; email?: EmailRow } }>;
  event?: { payload?: { type?: string; email?: EmailRow } };
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "active", label: "Активные" },
  { key: "history", label: "История почтовых ящиков" },
  { key: "security", label: "Безопасность" },
  { key: "tariff", label: "Тариф" },
  { key: "referrals", label: "Рефералы" },
  { key: "delete", label: "Удалить профиль" },
];

const deletionIntervals = [
  { value: "D1", label: "1 день" },
  { value: "D5", label: "5 дней" },
  { value: "D10", label: "10 дней" },
  { value: "D30", label: "30 дней" },
  { value: "D90", label: "90 дней" },
  { value: "D180", label: "180 дней" },
  { value: "Y1", label: "1 год" },
];

const extendOptions: Record<UserTier, number[]> = {
  FREE_GUEST: [30, 180],
  FREE_KEY: [30, 180, 360, 720, 1440, 2880],
  PREMIUM: [30, 180, 360, 720, 1440, 2880, 10080, 43200],
  UNLIMITED: [30, 180, 360, 720, 1440, 2880, 10080, 43200],
};

function groupedByDate(mailboxes: MailboxRow[]) {
  return mailboxes.reduce<Record<string, MailboxRow[]>>((acc, item) => {
    const key = new Date(item.createdAt).toLocaleDateString("ru-RU");
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function DashboardPage() {
  const [tab, setTab] = useState<TabKey>("active");
  const [message, setMessage] = useState("");
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [allEmails, setAllEmails] = useState<AggregatedEmailRow[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("");
  const [searchMailbox, setSearchMailbox] = useState("");
  const [emailHistorySearch, setEmailHistorySearch] = useState("");
  const [emailHistoryMailbox, setEmailHistoryMailbox] = useState("");
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [deletionInterval, setDeletionInterval] = useState("D30");
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteKey, setDeleteKey] = useState("");
  const [realtimeState, setRealtimeState] = useState("offline");
  const [telegramSupport, setTelegramSupport] = useState("");
  const [createForm, setCreateForm] = useState({
    random: true,
    domain: "",
    username: "",
    extendMinutes: 30,
  });
  const [referralSummary, setReferralSummary] =
    useState<ReferralSummary | null>(null);
  const [withdrawForm, setWithdrawForm] = useState({
    amountUsd: "50",
    moneroAddress: "",
    memo: "",
    open: false,
  });
  const [referralLoading, setReferralLoading] = useState(false);

  const selectedMailboxAddress = mailboxes.find(
    (item) => item.id === selectedMailbox,
  )?.address;
  const selectedMailboxRow =
    mailboxes.find((item) => item.id === selectedMailbox) || null;

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    setUser(data.user || null);
    if (data.user?.deletionInterval)
      setDeletionInterval(data.user.deletionInterval);
  }, []);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/site/meta");
    if (!res.ok) return;
    const data = await res.json();
    setTelegramSupport(data.telegramSupport || "");
  }, []);

  const loadDomains = useCallback(async () => {
    const res = await fetch("/api/domains/my");
    if (!res.ok) return;
    const data = await res.json();
    const rows: DomainRow[] = data.domains || [];
    setDomains(rows);
    setCreateForm((prev) => ({
      ...prev,
      domain: prev.domain || rows[0]?.name || "",
    }));
  }, []);

  const loadReferralSummary = useCallback(async () => {
    setReferralLoading(true);
    const res = await fetch("/api/referrals/summary", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setReferralLoading(false);
      return;
    }
    setReferralSummary(data);
    setWithdrawForm((prev) => ({
      ...prev,
      amountUsd: prev.amountUsd || data.minWithdrawalUsd || "50",
    }));
    setReferralLoading(false);
  }, []);

  const loadEmails = useCallback(async (mailboxId: string) => {
    const res = await fetch(`/api/mailboxes/${mailboxId}/emails`);
    if (!res.ok) {
      setEmails([]);
      return;
    }
    const data = await res.json();
    setEmails(data.emails || []);
  }, []);

  const loadAllEmails = useCallback(async (rows: MailboxRow[]) => {
    const chunks = await Promise.all(
      rows.map(async (row) => {
        const res = await fetch(`/api/mailboxes/${row.id}/emails`);
        if (!res.ok) return [] as AggregatedEmailRow[];
        const data = await res.json();
        return ((data.emails || []) as EmailRow[]).map((email) => ({
          ...email,
          mailboxId: row.id,
          mailboxAddress: row.address,
        }));
      }),
    );

    setAllEmails(
      chunks
        .flat()
        .sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt)),
    );
  }, []);

  const loadMailboxes = useCallback(async () => {
    const res = await fetch("/api/mailboxes");
    if (!res.ok) return;
    const data = await res.json();
    const rows: MailboxRow[] = data.mailboxes || [];
    setMailboxes(rows);

    const nextSelected =
      selectedMailbox && rows.some((row) => row.id === selectedMailbox)
        ? selectedMailbox
        : rows[0]?.id || "";

    if (nextSelected) {
      setSelectedMailbox(nextSelected);
      await loadEmails(nextSelected);
    } else {
      setSelectedMailbox("");
      setEmails([]);
    }

    await loadAllEmails(rows);
  }, [loadAllEmails, loadEmails, selectedMailbox]);

  async function createMailbox() {
    const payload = {
      random: createForm.random,
      extendMinutes: Number(createForm.extendMinutes),
      ...(createForm.random
        ? {}
        : {
            domain: createForm.domain,
            username: createForm.username.trim().toLowerCase(),
          }),
    };

    const res = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Не удалось создать почтовый ящик");
      return;
    }

    setMessage(`Новый почтовый ящик создан: ${data.mailbox.address}`);
    setCreateForm((prev) => ({ ...prev, username: "" }));
    await loadMailboxes();
  }

  async function extendMailbox(mailboxId: string, minutes: number) {
    const res = await fetch("/api/mailboxes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailboxId, minutes }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || "Не удалось продлить ящик");
    setMessage(`Ящик продлён на ${minutes} минут.`);
    await loadMailboxes();
  }

  async function deleteMailbox(mailboxId: string) {
    const res = await fetch("/api/mailboxes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailboxId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || "Не удалось удалить ящик");
    setMessage("Ящик удалён.");
    await loadMailboxes();
  }

  async function restoreMailbox(mailboxId: string) {
    const res = await fetch(`/api/mailboxes/${mailboxId}/restore`, {
      method: "PATCH",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return setMessage(data.error || "Не удалось восстановить этот ящик");
    setSelectedMailbox(mailboxId);
    setEmails(data.emails || []);
    setMessage("Ящик восстановлен и снова активен.");
    await loadMailboxes();
  }

  async function openMailbox(mailboxId: string) {
    setSelectedMailbox(mailboxId);
    await loadEmails(mailboxId);
  }

  async function deleteEmail(emailId: string) {
    const res = await fetch(`/api/emails/${emailId}`, { method: "DELETE" });
    if (!res.ok) return setMessage("Не удалось удалить письмо");
    setEmails((prev) => prev.filter((item) => item.id !== emailId));
    setAllEmails((prev) => prev.filter((item) => item.id !== emailId));
  }

  async function clearLogs() {
    const res = await fetch("/api/auth/clear-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setMessage(res.ok ? "Логи очищены." : "Не удалось очистить логи.");
  }

  async function saveDeletionPolicy() {
    const res = await fetch("/api/auth/deletion-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: deletionInterval }),
    });
    if (!res.ok) return setMessage("Не удалось сохранить автоудаление");
    setMessage("Политика автоудаления обновлена.");
    await loadMe();
  }

  async function purgeHistory() {
    const res = await fetch("/api/auth/purge-history", { method: "POST" });
    if (!res.ok) return setMessage("Не удалось очистить историю.");
    setMessage("История почтовых ящиков и логи очищены.");
    setSelectedMailbox("");
    setEmails([]);
    await loadMailboxes();
  }

  async function deleteAccount() {
    if (!deleteConfirm || !deleteKey)
      return setMessage("Подтвердите удаление и введите ключ.");
    const res = await fetch("/api/auth/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, key: deleteKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error || "Не удалось удалить аккаунт");
    setDeleteModal(false);
    setDeleteConfirm(false);
    setDeleteKey("");
    setMessage(
      "Аккаунт переведён в soft delete. В админке он будет виден ещё 30 дней.",
    );
    setUser(null);
    setMailboxes([]);
    setEmails([]);
    setAllEmails([]);
  }

  async function copyPublicId() {
    if (!user?.publicId) return;
    await navigator.clipboard.writeText(user.publicId);
    setMessage("publicId скопирован.");
  }

  async function copyReferralLink() {
    if (!referralSummary?.referralLink) return;
    await navigator.clipboard.writeText(referralSummary.referralLink);
    setMessage("Реферальная ссылка скопирована.");
  }

  async function submitWithdrawal() {
    const res = await fetch("/api/withdrawals/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd: Number(withdrawForm.amountUsd),
        moneroAddress: withdrawForm.moneroAddress,
        memo: withdrawForm.memo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Не удалось создать запрос на вывод.");
      return;
    }
    setMessage("Заявка на вывод создана со статусом PENDING.");
    setWithdrawForm((prev) => ({
      ...prev,
      moneroAddress: "",
      memo: "",
      open: false,
    }));
    await loadReferralSummary();
  }

  useEffect(() => {
    void Promise.all([
      loadMe(),
      loadMeta(),
      loadDomains(),
      loadMailboxes(),
      loadReferralSummary(),
    ]);
  }, [loadDomains, loadMailboxes, loadMe, loadMeta, loadReferralSummary]);

  useEffect(() => {
    if (!message) return;
    toast.info(message);
  }, [message]);

  useEffect(() => {
    if (tab === "referrals" && !referralSummary && !referralLoading) {
      void loadReferralSummary();
    }
  }, [tab, referralSummary, referralLoading, loadReferralSummary]);

  useEffect(() => {
    if (!user || !selectedMailbox) return;
    let cancelled = false;
    let ws: WebSocket | null = null;

    async function connect() {
      setRealtimeState("connecting");
      const res = await fetch("/api/realtime/token", { method: "POST" });
      if (!res.ok) {
        setRealtimeState("unavailable");
        return;
      }

      const data = await res.json();
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.hostname}:3001`);

      ws.addEventListener("open", () => {
        if (cancelled || !ws) return;
        ws.send(
          JSON.stringify({
            type: "subscribe",
            token: data.token,
            channel: data.channel,
            cursor: 0,
          }),
        );
      });

      ws.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data) as RealtimeEnvelope;
        if (payload.type === "connected") {
          setRealtimeState("connected");
          return;
        }
        if (payload.type === "subscribed") {
          setRealtimeState("subscribed");
          return;
        }
        if (
          payload.type === "event" &&
          payload.event?.payload?.type === "new_email"
        ) {
          void loadMailboxes();
        }
      });

      ws.addEventListener("close", () => {
        if (!cancelled) setRealtimeState("offline");
      });
      ws.addEventListener("error", () => setRealtimeState("error"));
    }

    void connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [user, selectedMailbox, selectedMailboxRow?.id, loadMailboxes]);

  const activeMailboxes = useMemo(
    () => mailboxes.filter((item) => item.isActive),
    [mailboxes],
  );
  const historyMailboxes = useMemo(
    () => mailboxes.filter((item) => !item.isActive),
    [mailboxes],
  );
  const historyFiltered = useMemo(
    () =>
      historyMailboxes.filter((item) =>
        item.address.toLowerCase().includes(searchMailbox.toLowerCase()),
      ),
    [historyMailboxes, searchMailbox],
  );
  const historyByDate = useMemo(
    () => groupedByDate(historyFiltered),
    [historyFiltered],
  );
  const currentTier = user?.tier || "FREE_KEY";
  const createOptions = extendOptions[currentTier];
  const manualAllowed = user?.tier === "PREMIUM" || user?.tier === "UNLIMITED";
  const filteredAllEmails = useMemo(() => {
    const search = emailHistorySearch.trim().toLowerCase();
    return allEmails.filter((email) => {
      if (emailHistoryMailbox && email.mailboxId !== emailHistoryMailbox)
        return false;
      if (!search) return true;
      return [
        email.mailboxAddress,
        email.fromAddress,
        email.subject,
        email.textBody || "",
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [allEmails, emailHistoryMailbox, emailHistorySearch]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Личный кабинет</h1>
        <div className="rounded border border-border bg-zinc-900 px-3 py-2 text-xs text-muted">
          Realtime inbox: {realtimeState}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Ваш publicId</p>
              <p className="text-xl font-semibold">{user?.publicId || "—"}</p>
            </div>
            <Button
              className="bg-zinc-700"
              onClick={copyPublicId}
              disabled={!user?.publicId || user.publicId.length < 5}
            >
              Копировать
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            <span className="rounded border border-border px-3 py-1.5">
              Тариф: {user?.tier || "FREE_KEY"}
            </span>
            <span className="rounded border border-border px-3 py-1.5">
              Автоудаление:{" "}
              {deletionIntervals.find((item) => item.value === deletionInterval)
                ?.label || deletionInterval}
            </span>
            <span className="rounded border border-border px-3 py-1.5">
              Рефкод:{" "}
              {referralSummary?.referralCode ||
                user?.referralCode ||
                "генерируется"}
            </span>
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="text-sm text-muted">Быстрые действия</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/payments">
              <Button>Повысить до PREMIUM</Button>
            </Link>
            <Link href="/payments">
              <Button className="bg-violet-700">до UNLIMITED</Button>
            </Link>
            <Button
              className="bg-emerald-700"
              onClick={() => setTab("referrals")}
            >
              <Gift className="mr-2 h-4 w-4" />
              Открыть рефералы
            </Button>
            {telegramSupport ? (
              <a href={telegramSupport} target="_blank" rel="noreferrer">
                <Button className="bg-zinc-700">Связаться с саппортом</Button>
              </a>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={item.key === tab ? "bg-violet-600" : "bg-zinc-800"}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {message ? (
        <Card>
          <p className="text-sm text-muted">{message}</p>
        </Card>
      ) : null}

      {tab === "active" ? (
        <div className="grid gap-4 xl:grid-cols-[420px,1fr]">
          <div className="space-y-4">
            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">Создать почтовый ящик</h2>
              <p className="text-sm text-muted">
                Тариф: {user?.tier || "FREE_KEY"}. Доступные сроки:{" "}
                {createOptions.join(", ")} минут.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.random}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      random: e.target.checked,
                    }))
                  }
                />
                Случайный адрес
              </label>
              <select
                value={createForm.extendMinutes}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    extendMinutes: Number(e.target.value),
                  }))
                }
                className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
              >
                {createOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} минут
                  </option>
                ))}
              </select>

              {manualAllowed && !createForm.random ? (
                <div className="space-y-2">
                  <select
                    value={createForm.domain}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        domain: e.target.value,
                      }))
                    }
                    className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
                  >
                    {domains.map((domain) => (
                      <option key={domain.id} value={domain.name}>
                        {domain.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={createForm.username}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        username: e.target.value.replace(/[^a-z0-9]/g, ""),
                      }))
                    }
                    placeholder="username"
                    className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {!manualAllowed ? (
                <p className="text-xs text-muted">
                  Ручной выбор username/domain открывается только на Premium и
                  Unlimited.
                </p>
              ) : null}
              <Button className="bg-violet-600" onClick={createMailbox}>
                Создать почтовый ящик
              </Button>
            </Card>

            <Card>
              <h2 className="mb-3 text-lg font-semibold">Мои активные ящики</h2>
              <div className="space-y-2">
                {activeMailboxes.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded border p-3 text-sm ${selectedMailbox === item.id ? "border-violet-500 bg-violet-950/30" : "border-border bg-zinc-900"}`}
                  >
                    <button
                      className="block w-full text-left"
                      onClick={() => openMailbox(item.id)}
                    >
                      <div className="font-mono text-xs break-all">
                        {item.address}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Истекает: {new Date(item.expiresAt).toLocaleString()}
                      </div>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {createOptions.map((minutes) => (
                        <Button
                          key={minutes}
                          className="bg-zinc-700"
                          onClick={() => extendMailbox(item.id, minutes)}
                        >
                          +{minutes}м
                        </Button>
                      ))}
                      <Button
                        className="bg-red-800"
                        onClick={() => deleteMailbox(item.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))}
                {!activeMailboxes.length ? (
                  <p className="text-sm text-muted">
                    Активных ящиков пока нет.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Инбокс</h2>
            <p className="mb-4 text-sm text-muted">
              {selectedMailboxAddress
                ? `Текущий ящик: ${selectedMailboxAddress}`
                : "Выберите ящик слева"}
            </p>
            <div className="space-y-2">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="rounded border border-border bg-zinc-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {email.subject || "(без темы)"}
                      </div>
                      <div className="text-xs text-muted">
                        {email.fromAddress} •{" "}
                        {new Date(email.receivedAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      className="bg-red-800"
                      onClick={() => deleteEmail(email.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                  {email.textBody ? (
                    <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                      {email.textBody}
                    </pre>
                  ) : null}
                </div>
              ))}
              {!emails.length ? (
                <p className="text-sm text-muted">Писем пока нет.</p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                value={searchMailbox}
                onChange={(e) => setSearchMailbox(e.target.value)}
                placeholder="Поиск по адресу"
                className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm md:max-w-sm"
              />
            </div>
            <div className="space-y-4">
              {Object.entries(historyByDate).map(([date, rows]) => (
                <div key={date}>
                  <h3 className="mb-2 text-sm font-medium text-muted">
                    {date}
                  </h3>
                  <div className="space-y-2">
                    {rows.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-border bg-zinc-900 p-3 text-sm"
                      >
                        <div className="font-mono break-all">
                          {item.address}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Истёк: {new Date(item.expiresAt).toLocaleString()}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            className="bg-zinc-700"
                            onClick={() => openMailbox(item.id)}
                          >
                            Просмотр писем
                          </Button>
                          <Button onClick={() => restoreMailbox(item.id)}>
                            Восстановить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!historyMailboxes.length ? (
                <p className="text-sm text-muted">История пока пуста.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">История всех писем</h2>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={emailHistoryMailbox}
                onChange={(e) => setEmailHistoryMailbox(e.target.value)}
                className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
              >
                <option value="">Все ящики</option>
                {mailboxes.map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.id}>
                    {mailbox.address}
                  </option>
                ))}
              </select>
              <input
                value={emailHistorySearch}
                onChange={(e) => setEmailHistorySearch(e.target.value)}
                placeholder="Поиск по теме, from, mailbox"
                className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 space-y-3">
              {filteredAllEmails.map((email) => (
                <div
                  key={`${email.mailboxId}_${email.id}`}
                  className="rounded border border-border bg-zinc-900 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {email.subject || "(без темы)"}
                      </div>
                      <div className="text-xs text-muted">
                        {email.fromAddress} → {email.mailboxAddress}
                      </div>
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(email.receivedAt).toLocaleString()}
                    </div>
                  </div>
                  {email.textBody ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                      {email.textBody}
                    </p>
                  ) : null}
                </div>
              ))}
              {!filteredAllEmails.length ? (
                <p className="text-sm text-muted">Писем по фильтру пока нет.</p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "security" ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Безопасность и приватность</h2>
          <Button onClick={clearLogs}>Очистить сессии / логи</Button>
          <Button className="bg-zinc-700" onClick={purgeHistory}>
            Очистить историю ящиков и писем
          </Button>
          {telegramSupport ? (
            <a href={telegramSupport} target="_blank" rel="noreferrer">
              <Button className="bg-zinc-700">Связаться с саппортом</Button>
            </a>
          ) : null}
        </Card>
      ) : null}

      {tab === "tariff" ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Тариф и автоудаление</h2>
          <p className="text-sm text-muted">
            Текущий тариф: {user?.tier || "FREE_KEY"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/payments">
              <Button>Повысить до PREMIUM</Button>
            </Link>
            <Link href="/payments">
              <Button className="bg-violet-700">до UNLIMITED</Button>
            </Link>
          </div>
          <select
            value={deletionInterval}
            onChange={(e) => setDeletionInterval(e.target.value)}
            className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm md:max-w-xs"
          >
            {deletionIntervals.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button onClick={saveDeletionPolicy}>Сохранить автоудаление</Button>
          <Button className="bg-zinc-700" onClick={() => setTab("history")}>
            Открыть историю ящиков
          </Button>
        </Card>
      ) : null}

      {tab === "referrals" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="space-y-3 lg:col-span-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Gift className="h-5 w-5" />
                Мой реферальный код
              </h2>
              <div className="rounded border border-border bg-zinc-900 p-3 font-mono text-lg">
                {referralSummary?.referralCode ||
                  (referralLoading ? "Загрузка..." : "—")}
              </div>
              <div className="rounded border border-border bg-zinc-950 p-3 text-sm text-muted break-all">
                {referralSummary?.referralLink ||
                  "https://твойдомен.ru/?ref=CODE"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={copyReferralLink}
                  disabled={!referralSummary?.referralLink}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Скопировать ссылку
                </Button>
                <Button
                  className="bg-zinc-700"
                  onClick={() => void loadReferralSummary()}
                >
                  Обновить
                </Button>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Wallet className="h-5 w-5" />
                Баланс рефералок
              </h2>
              <div className="text-3xl font-semibold">
                {referralSummary?.referralBalance || "0.00"} USD
              </div>
              <p className="text-sm text-muted">
                Минимальный вывод: {referralSummary?.minWithdrawalUsd || "50"}{" "}
                USD.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-emerald-700"
                  onClick={() =>
                    setWithdrawForm((prev) => ({
                      ...prev,
                      amountUsd:
                        prev.amountUsd ||
                        referralSummary?.minWithdrawalUsd ||
                        "50",
                      open: true,
                    }))
                  }
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Вывести на Monero
                </Button>
                <Link
                  href={`/payments?source=referrals&amount=${encodeURIComponent(referralSummary?.referralBalance || "0")}`}
                >
                  <Button className="bg-violet-700">Потратить на тариф</Button>
                </Link>
              </div>
            </Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">Приведённые друзья</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="pb-3 pr-4 font-medium">publicId</th>
                      <th className="pb-3 pr-4 font-medium">Tier</th>
                      <th className="pb-3 pr-4 font-medium">
                        Сумма их платежей
                      </th>
                      <th className="pb-3 font-medium">Мой заработок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(referralSummary?.referrals || []).map((friend) => (
                      <tr key={friend.id} className="border-b border-border/70">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{friend.publicId}</div>
                          <div className="text-xs text-muted">
                            {new Date(friend.joinedAt).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{friend.tier}</td>
                        <td className="py-3 pr-4">
                          {friend.totalPaymentsUsd} USD
                        </td>
                        <td className="py-3">{friend.earnedUsd} USD</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!referralLoading &&
              !(referralSummary?.referrals || []).length ? (
                <p className="text-sm text-muted">
                  Пока нет приведённых друзей.
                </p>
              ) : null}
            </Card>

            <div className="space-y-4">
              <Card className="space-y-4">
                <h2 className="text-lg font-semibold">Мои бонусы</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="pb-3 pr-4 font-medium">Дата</th>
                        <th className="pb-3 pr-4 font-medium">Тип</th>
                        <th className="pb-3 pr-4 font-medium">Сумма</th>
                        <th className="pb-3 font-medium">От кого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(referralSummary?.recentBonuses || []).map((bonus) => (
                        <tr
                          key={bonus.id}
                          className="border-b border-border/70"
                        >
                          <td className="py-3 pr-4">
                            {new Date(bonus.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4">{bonus.type}</td>
                          <td className="py-3 pr-4">{bonus.amountUsd} USD</td>
                          <td className="py-3">
                            {bonus.referredPublicId} · {bonus.referredTier}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!referralLoading &&
                !(referralSummary?.recentBonuses || []).length ? (
                  <p className="text-sm text-muted">Начислений пока нет.</p>
                ) : null}
              </Card>

              {withdrawForm.open ? (
                <Card id="withdrawal-form" className="space-y-4">
                  <h2 className="text-lg font-semibold">Withdrawal request</h2>
                  <p className="text-sm text-muted">
                    Сумма должна быть не меньше{" "}
                    {referralSummary?.minWithdrawalUsd || "50"} USD. Endpoint:
                    POST /api/withdrawals/request.
                  </p>
                  <div className="grid gap-3">
                    <input
                      value={withdrawForm.amountUsd}
                      onChange={(e) =>
                        setWithdrawForm((prev) => ({
                          ...prev,
                          amountUsd: e.target.value,
                        }))
                      }
                      type="number"
                      min={referralSummary?.minWithdrawalUsd || "50"}
                      step="0.01"
                      className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
                      placeholder="Сумма, USD"
                    />
                    <input
                      value={withdrawForm.moneroAddress}
                      onChange={(e) =>
                        setWithdrawForm((prev) => ({
                          ...prev,
                          moneroAddress: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
                      placeholder="Monero address"
                    />
                    <input
                      value={withdrawForm.memo}
                      onChange={(e) =>
                        setWithdrawForm((prev) => ({
                          ...prev,
                          memo: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm"
                      placeholder="Memo (необязательно)"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="bg-emerald-700"
                        onClick={submitWithdrawal}
                      >
                        Создать Withdrawal PENDING
                      </Button>
                      <Button
                        className="bg-zinc-700"
                        onClick={() =>
                          setWithdrawForm((prev) => ({ ...prev, open: false }))
                        }
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}

              <Card>
                <h2 className="mb-4 text-lg font-semibold">История выводов</h2>
                <div className="space-y-3">
                  {(referralSummary?.withdrawals || []).map((withdrawal) => (
                    <div
                      key={withdrawal.id}
                      className="rounded border border-border bg-zinc-900 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {withdrawal.amountUsd} USD
                          </div>
                          <div className="text-xs text-muted">
                            {withdrawal.status} ·{" "}
                            {new Date(withdrawal.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="max-w-[220px] break-all text-right text-xs text-muted">
                          {withdrawal.moneroAddress}
                        </div>
                      </div>
                      {withdrawal.memo ? (
                        <div className="mt-2 text-xs text-muted">
                          memo: {withdrawal.memo}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!referralLoading &&
                  !(referralSummary?.withdrawals || []).length ? (
                    <p className="text-sm text-muted">
                      Заявок на вывод пока нет.
                    </p>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>{" "}
        </div>
      ) : null}

      {tab === "delete" ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Удалить профиль</h2>
          <p className="text-sm text-muted">
            Удаление выполняется как soft delete: профиль скрывается из обычной
            работы, но ещё 30 дней остаётся виден в админке.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.checked)}
            />
            Я понимаю, что хочу удалить себя.
          </label>
          <input
            value={deleteKey}
            onChange={(e) => setDeleteKey(e.target.value)}
            placeholder="Введите ваш ключ"
            className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm md:max-w-md"
          />
          <div className="flex gap-2">
            <Button className="bg-red-800" onClick={() => setDeleteModal(true)}>
              Удалить меня
            </Button>
          </div>
          {deleteModal ? (
            <div className="rounded border border-red-700 bg-red-950/40 p-4 text-sm">
              <p className="mb-3">Подтвердить soft-delete аккаунта?</p>
              <div className="flex gap-2">
                <Button className="bg-red-800" onClick={deleteAccount}>
                  Да, удалить
                </Button>
                <Button
                  className="bg-zinc-700"
                  onClick={() => setDeleteModal(false)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
