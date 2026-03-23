import { NextRequest, NextResponse } from "next/server";
import { DomainStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildGuestToken, guestCookieName, verifyGuestToken } from "@/lib/server/guest-session";
import { isServiceWebDomain } from "@/lib/server/domain-policy";
import { generateReadableLocalPart } from "@/lib/server/mailbox-localpart";

const FREE_EXTEND_MINUTES = [30, 180] as const;

async function loadActiveFreeDomains() {
  const rows = await prisma.domain.findMany({
    where: { tier: "FREE", status: DomainStatus.active },
    orderBy: { name: "asc" }
  });
  return rows.filter((d) => !isServiceWebDomain(d.name) && d.currentMailboxes < d.maxMailboxes);
}

async function getGuestMailboxFromCookie(request: NextRequest) {
  const token = request.cookies.get(guestCookieName())?.value;
  if (!token) return null;
  const parsed = verifyGuestToken(token);
  if (!parsed) return null;

  const mailbox = await prisma.mailbox.findUnique({ where: { id: parsed.mailboxId } });
  if (!mailbox || !mailbox.isGuest) return null;
  return mailbox;
}

export async function GET(request: NextRequest) {
  const mailbox = await getGuestMailboxFromCookie(request);
  if (!mailbox) return NextResponse.json({ mailbox: null });

  return NextResponse.json({
    mailbox: {
      id: mailbox.id,
      address: mailbox.address,
      expiresAt: mailbox.expiresAt,
      isActive: mailbox.isActive
    }
  });
}

export async function POST(request: NextRequest) {
  const existing = await getGuestMailboxFromCookie(request);
  if (existing && existing.isActive && existing.expiresAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "Guest mailbox already exists. Delete it before creating a new one." }, { status: 400 });
  }

  const domains = await loadActiveFreeDomains();
  if (!domains.length) return NextResponse.json({ error: "No free domains available" }, { status: 400 });

  const domain = domains[Math.floor(Math.random() * domains.length)];
  const localPart = generateReadableLocalPart();
  const address = `${localPart}@${domain.name}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const mailbox = await prisma.mailbox.create({
    data: {
      userId: null,
      domainId: domain.id,
      localPart,
      address,
      expiresAt,
      isActive: true,
      isGuest: true
    },
    select: { id: true, address: true, expiresAt: true, isActive: true }
  });

  const nextCount = domain.currentMailboxes + 1;
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      currentMailboxes: { increment: 1 },
      status: nextCount >= domain.maxMailboxes ? DomainStatus.exhausted : DomainStatus.active
    }
  });

  const token = buildGuestToken(mailbox.id, 180);
  const response = NextResponse.json({ mailbox });
  response.cookies.set(guestCookieName(), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 3
  });

  return response;
}

export async function PATCH(request: NextRequest) {
  const mailbox = await getGuestMailboxFromCookie(request);
  if (!mailbox || !mailbox.isActive) return NextResponse.json({ error: "Guest mailbox not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const minutes = Number(body?.minutes || 30);
  if (!FREE_EXTEND_MINUTES.includes(minutes as (typeof FREE_EXTEND_MINUTES)[number])) {
    return NextResponse.json({ error: "Guest extension must be 30 or 180 minutes" }, { status: 400 });
  }

  const next = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: { expiresAt: new Date(mailbox.expiresAt.getTime() + minutes * 60 * 1000) },
    select: { id: true, address: true, expiresAt: true, isActive: true }
  });

  return NextResponse.json({ mailbox: next });
}

export async function DELETE(request: NextRequest) {
  const mailbox = await getGuestMailboxFromCookie(request);
  if (!mailbox) return NextResponse.json({ ok: true, deleted: false });

  await prisma.mailbox.delete({ where: { id: mailbox.id } });

  const response = NextResponse.json({ ok: true, deleted: true });
  response.cookies.set(guestCookieName(), "", { path: "/", maxAge: 0 });
  return response;
}
