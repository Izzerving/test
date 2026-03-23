import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { simpleParser, type AttachmentLike } from "mailparser";
import { z } from "zod";
import { appendRealtimeEvent } from "@/lib/server/realtime";
import { getRedis } from "@/lib/server/redis";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const structuredSchema = z.object({
  to: z.string().email(),
  from: z.string().email(),
  subject: z.string().max(500),
  text: z.string().max(100000).optional(),
  html: z.string().max(200000).optional(),
  rawMime: z.string().max(500000).optional(),
  messageId: z.string().max(300).optional()
});

function isBlockedSender(sender: string) {
  const blocked = (process.env.BLOCKED_SENDER_DOMAINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const domain = sender.split("@")[1]?.toLowerCase() || "";
  return blocked.includes(domain);
}

function sanitizeText(input?: string) {
  if (!input) return undefined;
  return input.replace(/\u0000/g, "").slice(0, 100000);
}

function sanitizeHtml(input?: string) {
  if (!input) return undefined;
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 200000);
}

async function isRateLimited(recipient: string, maxPerMinute = 30) {
  const redis = getRedis();
  const key = `ingest:rl:${recipient.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count > maxPerMinute;
}

async function isDuplicateMessage(recipient: string, messageKey: string) {
  const dedupHash = createHash("sha256").update(`${recipient}:${messageKey}`).digest("hex");
  const key = `ingest:dedup:${dedupHash}`;
  const set = await getRedis().set(key, "1", "EX", 3600, "NX");
  return set === null;
}

const logger = createLogger("api.ingest.email");

export async function POST(request: NextRequest) {
  try {
    const ingestSecret = request.headers.get("x-ingest-key");
    if (!process.env.INGEST_API_KEY || ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = structuredSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    let payload = parsed.data;
    if (payload.rawMime) {
      const mime = await simpleParser(payload.rawMime);
      const blockedExtensions = (process.env.INGEST_BLOCKED_EXTENSIONS || "exe,bat,cmd,scr,js").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const maxAttachments = Number(process.env.INGEST_MAX_ATTACHMENTS || 10);
      const maxAttachmentBytes = Number(process.env.INGEST_MAX_ATTACHMENT_BYTES || 2_000_000);
      const attachments = mime.attachments || [];

      if (attachments.length > maxAttachments) {
        return NextResponse.json({ ok: true, blocked: true, reason: "too_many_attachments" });
      }

      const totalSize = attachments.reduce((acc: number, file: AttachmentLike) => acc + (file.size || 0), 0);
      if (totalSize > maxAttachmentBytes) {
        return NextResponse.json({ ok: true, blocked: true, reason: "attachments_too_large" });
      }

      const hasBlockedExt = attachments.some((a: AttachmentLike) => {
        const filename = (a.filename || "").toLowerCase();
        const ext = filename.includes(".") ? filename.split(".").pop() : "";
        return !!ext && blockedExtensions.includes(ext);
      });
      if (hasBlockedExt) {
        return NextResponse.json({ ok: true, blocked: true, reason: "blocked_attachment_extension" });
      }

      payload = {
        ...payload,
        to: mime.to?.value?.[0]?.address || payload.to,
        from: mime.from?.value?.[0]?.address || payload.from,
        subject: mime.subject || payload.subject,
        text: mime.text || payload.text,
        html: typeof mime.html === "string" ? mime.html : payload.html,
        messageId: mime.messageId || payload.messageId
      };
    }

    if (isBlockedSender(payload.from)) {
      return NextResponse.json({ ok: true, blocked: true });
    }

    if (await isRateLimited(payload.to)) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const dedupKey = payload.messageId || `${payload.from}:${payload.subject}:${payload.text?.slice(0, 120) || ""}`;
    if (await isDuplicateMessage(payload.to, dedupKey)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const mailbox = await prisma.mailbox.findUnique({
      where: { address: payload.to },
      include: { user: { select: { tier: true } } }
    });
    if (!mailbox || !mailbox.isActive) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const isUnlimited = mailbox.user?.tier === "UNLIMITED";
    const retentionMinutes = mailbox.userId ? 60 * 24 * 2 : 60 * 3;
    const deleteAt = isUnlimited
      ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + retentionMinutes * 60 * 1000);

    const email = await prisma.email.create({
      data: {
        mailboxId: mailbox.id,
        fromAddress: payload.from,
        subject: payload.subject,
        textBody: sanitizeText(payload.text),
        htmlBody: sanitizeHtml(payload.html),
        deleteAt
      },
      select: { id: true, mailboxId: true, subject: true, receivedAt: true }
    });

    if (mailbox.userId) {
      await appendRealtimeEvent(`user:${mailbox.userId}`, { type: "new_email", email });
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    await captureException(error, { route: "/api/ingest/email", area: "ingest" });
    logger.error("ingest.unhandled_error", { error: getErrorMessage(error) });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
