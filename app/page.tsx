"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { AppLang, formatDateTimeWithUtc, langLabels, resolveLang, supportedLangs } from "@/lib/i18n";

type GuestMailbox = {
  id: string;
  address: string;
  expiresAt: string;
  isActive: boolean;
};

type GuestEmail = {
  id: string;
  fromAddress: string;
  subject: string;
  textBody: string | null;
  receivedAt: string;
};

const i18n = {
  ru: {
    login: "Вход по ключу", boxes: "Мои ящики", dashboard: "ЛК", payments: "Платежи", privacy: "Privacy", admin: "Админка",
    guestTitle: "Гостевой временный адрес (Free без регистрации, только web-flow)",
    create: "Создать", copy: "Copy", ext30: "+30м", ext180: "+3ч", timer: "Timer", del: "Delete",
    qrPreview: "QR preview", noMailbox: "Нажмите «Создать»", copied: "Адрес скопирован", created: "Гостевой ящик создан",
    expiredHint: "Если время истекло и не продлено — ящик и письма удаляются безвозвратно.",
    localTime: "Локальное время", utcTime: "UTC время",
    inbox: "Guest inbox (live)", strengthened: "Что уже усилили"
  },
  en: {
    login: "Key login", boxes: "My mailboxes", dashboard: "Dashboard", payments: "Payments", privacy: "Privacy", admin: "Admin",
    guestTitle: "Guest temporary mailbox (Free no-registration, web-only flow)",
    create: "Create", copy: "Copy", ext30: "+30m", ext180: "+3h", timer: "Timer", del: "Delete",
    qrPreview: "QR preview", noMailbox: "Click “Create”", copied: "Address copied", created: "Guest mailbox created",
    expiredHint: "If not extended in time, mailbox and emails are permanently deleted.",
    localTime: "Local time", utcTime: "UTC time",
    inbox: "Guest inbox (live)", strengthened: "What was improved"
  },
  zh: {
    login: "密钥登录", boxes: "我的邮箱", dashboard: "控制台", payments: "支付", privacy: "隐私", admin: "管理",
    guestTitle: "游客临时邮箱（免注册，仅网页流程）",
    create: "创建", copy: "复制", ext30: "+30分钟", ext180: "+3小时", timer: "计时器", del: "删除",
    qrPreview: "二维码预览", noMailbox: "点击“创建”", copied: "地址已复制", created: "游客邮箱已创建",
    expiredHint: "如果超时未续期，邮箱和邮件会被永久删除。",
    localTime: "本地时间", utcTime: "UTC 时间",
    inbox: "游客收件箱（实时轮询）", strengthened: "已加强"
  },
  de: {
    login: "Login per Schlüssel", boxes: "Meine Postfächer", dashboard: "Konto", payments: "Zahlungen", privacy: "Datenschutz", admin: "Admin",
    guestTitle: "Gast-Temporäradresse (Free ohne Registrierung, nur Web-Flow)",
    create: "Erstellen", copy: "Kopieren", ext30: "+30m", ext180: "+3h", timer: "Timer", del: "Löschen",
    qrPreview: "QR-Vorschau", noMailbox: "Auf „Erstellen“ klicken", copied: "Adresse kopiert", created: "Gast-Postfach erstellt",
    expiredHint: "Wenn nicht verlängert, werden Postfach und E-Mails endgültig gelöscht.",
    localTime: "Lokale Zeit", utcTime: "UTC Zeit",
    inbox: "Gast-Posteingang (live)", strengthened: "Verbesserungen"
  }
} satisfies Record<AppLang, Record<string, string>>;

function toPseudoQrBits(value: string) {
  const hash = Array.from(value || "anon").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const bits: number[] = [];
  let x = hash;
  for (let i = 0; i < 225; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    bits.push(x & 1);
  }
  return bits;
}

const advantages = ["Anon key-only auth", "Realtime dashboard inbox", "Live guest inbox polling", "Plan-aware Premium/Unlimited payments"];

export default function HomePage() {
  const [mailbox, setMailbox] = useState<GuestMailbox | null>(null);
  const [emails, setEmails] = useState<GuestEmail[]>([]);
  const [msg, setMsg] = useState("");
  const [nowTs, setNowTs] = useState(Date.now());
  const [lang, setLang] = useState<AppLang>("ru");

  const t = i18n[lang];

  async function loadGuestMailbox() {
    const res = await fetch("/api/guest/mailbox", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setMailbox(data.mailbox || null);
  }

  async function loadGuestEmails() {
    const res = await fetch("/api/guest/emails", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setMailbox(data.mailbox || null);
    setEmails(data.emails || []);
  }

  async function createGuestMailbox() {
    const res = await fetch("/api/guest/mailbox", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "error");
    setMailbox(data.mailbox || null);
    setEmails([]);
    setMsg(t.created);
  }

  async function extendGuestMailbox(minutes: 30 | 180) {
    const res = await fetch("/api/guest/mailbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes }) });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "error");
    setMailbox(data.mailbox || null);
  }

  async function deleteGuestMailbox() {
    const res = await fetch("/api/guest/mailbox", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "error");
    setMailbox(null);
    setEmails([]);
    setMsg(data.deleted ? "OK" : "-");
  }

  async function copyMailbox() {
    if (!mailbox?.address) return;
    await navigator.clipboard.writeText(mailbox.address).catch(() => null);
    setMsg(t.copied);
  }

  const timeLeft = useMemo(() => {
    if (!mailbox?.expiresAt) return "--:--:--";
    const left = new Date(mailbox.expiresAt).getTime() - nowTs;
    if (left <= 0) return "00:00:00";
    const totalSec = Math.floor(left / 1000);
    return `${String(Math.floor(totalSec / 3600)).padStart(2, "0")}:${String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
  }, [mailbox?.expiresAt, nowTs]);

  const mailTime = mailbox?.expiresAt ? formatDateTimeWithUtc(mailbox.expiresAt, lang) : null;

  useEffect(() => {
    const detected = resolveLang(localStorage.getItem("akm_lang") || navigator.language);
    setLang(detected);
    void Promise.all([loadGuestMailbox(), loadGuestEmails()]);
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    const inboxPoll = setInterval(() => { void loadGuestEmails(); }, 5000);
    return () => {
      clearInterval(timer);
      clearInterval(inboxPoll);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Time-Email</h1>
          <div className="flex flex-wrap gap-2">
            <select
              value={lang}
              onChange={(e) => {
                const next = resolveLang(e.target.value);
                setLang(next);
                localStorage.setItem("akm_lang", next);
              }}
              className="rounded border border-border bg-zinc-900 px-2 py-1 text-sm"
            >
              {supportedLangs.map((l) => <option key={l} value={l}>{langLabels[l]}</option>)}
            </select>
            <Link href="/auth"><Button className="bg-zinc-700">{t.login}</Button></Link>
            <Link href="/mailboxes"><Button className="bg-zinc-700">{t.boxes}</Button></Link>
            <Link href="/dashboard"><Button className="bg-zinc-700">{t.dashboard}</Button></Link>
            <Link href="/payments"><Button className="bg-zinc-700">{t.payments}</Button></Link>
            <Link href="/privacy"><Button className="bg-zinc-700">{t.privacy}</Button></Link>
            <Link href="/admin"><Button>{t.admin}</Button></Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <p className="text-sm text-muted">{t.guestTitle}</p>
          <p className="break-all rounded-md bg-zinc-900 p-3 text-base font-mono sm:text-lg">{mailbox?.address || t.noMailbox}</p>
          <div className="flex items-center gap-4">
            <div className="grid gap-[2px] rounded border border-border bg-zinc-950 p-2" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
              {toPseudoQrBits(mailbox?.address || "anon").map((bit, idx) => <div key={idx} className={`h-2 w-2 ${bit ? "bg-zinc-100" : "bg-zinc-800"}`} />)}
            </div>
            <p className="text-xs text-muted">{t.qrPreview}</p>
          </div>

          {mailTime ? (
            <div className="text-xs text-muted">
              <div>{t.localTime}: {mailTime.local}</div>
              <div>{t.utcTime}: {mailTime.utc}</div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={createGuestMailbox}>{t.create}</Button>
            <Button className="bg-zinc-700" onClick={copyMailbox} disabled={!mailbox?.address}>{t.copy}</Button>
            <Button className="bg-zinc-700" onClick={() => extendGuestMailbox(30)} disabled={!mailbox}>{t.ext30}</Button>
            <Button className="bg-zinc-700" onClick={() => extendGuestMailbox(180)} disabled={!mailbox}>{t.ext180}</Button>
            <Button className="bg-zinc-700" disabled>{t.timer} {timeLeft}</Button>
            <Button className="bg-red-800" onClick={deleteGuestMailbox} disabled={!mailbox}>{t.del}</Button>
          </div>
          {msg ? <p className="text-sm text-muted">{msg}</p> : null}
          <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 p-3 text-sm text-emerald-300">{t.expiredHint}</div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-medium">{t.strengthened}</h2>
          <ul className="space-y-2 text-sm text-muted">{advantages.map((item) => <li key={item} className="rounded border border-border bg-zinc-900 p-2">• {item}</li>)}</ul>
          <p className="text-xs text-muted">www.time-email.com / mail pools</p>
        </Card>
      </section>

      <Card>
        <h2 className="mb-4 text-lg font-medium">{t.inbox}</h2>
        <div className="space-y-2">
          {emails.map((email) => (
            <div key={email.id} className="rounded border border-border bg-zinc-900 p-3 text-sm">
              <div className="font-medium">{email.subject || "(без темы)"}</div>
              <div className="text-xs text-muted">{email.fromAddress} • {new Date(email.receivedAt).toLocaleString()}</div>
              {email.textBody ? <div className="mt-2 whitespace-pre-wrap text-zinc-300">{email.textBody}</div> : null}
            </div>
          ))}
          {!emails.length ? <div className="rounded border border-dashed border-border p-4 text-sm text-muted">Гостевой inbox пока пуст. Новые письма подгружаются автоматически каждые 5 секунд.</div> : null}
        </div>
      </Card>
    </main>
  );
}
