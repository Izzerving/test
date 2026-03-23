import { DomainStatus, DomainTier } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertIssuanceDomain, normalizeDomain } from "@/lib/server/domain-policy";
import { requestHasAdminAccess } from "@/lib/server/admin";

const createSchema = z.object({
  name: z.string().min(3),
  tier: z.nativeEnum(DomainTier),
  maxMailboxes: z.number().int().min(1).max(100000).default(500),
  dnsNs: z.string().min(1).optional(),
  transferAfterDays: z.number().int().min(1).max(3650).optional(),
  transferToTier: z.nativeEnum(DomainTier).optional().nullable()
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    domainId: z.string().min(1),
    tier: z.nativeEnum(DomainTier),
    maxMailboxes: z.number().int().min(1).max(100000),
    dnsNs: z.string().optional(),
    transferAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
    transferToTier: z.nativeEnum(DomainTier).nullable().optional()
  }),
  z.object({ action: z.literal("archive"), domainId: z.string().min(1) })
]);

const deleteSchema = z.object({ domainId: z.string().min(1) });

export async function GET(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const domains = await prisma.domain.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { mailboxes: true, userAccess: true } } }
  });

  return NextResponse.json({ domains });
}

export async function POST(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const name = normalizeDomain(parsed.data.name);
  try {
    assertIssuanceDomain(name);
  } catch {
    return NextResponse.json({ error: `Forbidden service domain: ${name}` }, { status: 400 });
  }

  const domain = await prisma.domain.upsert({
    where: { name },
    update: {
      tier: parsed.data.tier,
      status: DomainStatus.active,
      maxMailboxes: parsed.data.maxMailboxes,
      dnsNs: parsed.data.dnsNs,
      transferAfterDays: parsed.data.transferAfterDays,
      transferToTier: parsed.data.transferToTier ?? null
    },
    create: {
      name,
      tier: parsed.data.tier,
      status: DomainStatus.active,
      maxMailboxes: parsed.data.maxMailboxes,
      dnsNs: parsed.data.dnsNs,
      transferAfterDays: parsed.data.transferAfterDays,
      transferToTier: parsed.data.transferToTier ?? null
    }
  });

  return NextResponse.json({ ok: true, domain });
}

export async function PATCH(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (parsed.data.action === "archive") {
    const domain = await prisma.domain.update({ where: { id: parsed.data.domainId }, data: { status: DomainStatus.archived } });
    return NextResponse.json({ ok: true, domain });
  }

  const domain = await prisma.domain.update({
    where: { id: parsed.data.domainId },
    data: {
      tier: parsed.data.tier,
      maxMailboxes: parsed.data.maxMailboxes,
      dnsNs: parsed.data.dnsNs || null,
      transferAfterDays: parsed.data.transferAfterDays ?? null,
      transferToTier: parsed.data.transferToTier ?? null
    }
  });
  return NextResponse.json({ ok: true, domain });
}

export async function DELETE(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await prisma.domain.delete({ where: { id: parsed.data.domainId } });
  return NextResponse.json({ ok: true });
}
