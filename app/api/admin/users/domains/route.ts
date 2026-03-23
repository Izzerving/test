import { NextRequest, NextResponse } from "next/server";
import { DomainStatus, DomainTier } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assignDomainToUser, getUserDomainIds, unassignDomainFromUser } from "@/lib/server/user-domain-access";
import { assertIssuanceDomain, normalizeDomain } from "@/lib/server/domain-policy";

function assertAdmin(request: NextRequest) {
  const key = request.headers.get("x-admin-key");
  return key && process.env.ADMIN_SUPER_KEY && key === process.env.ADMIN_SUPER_KEY;
}

const getSchema = z.object({ userId: z.string().min(1) });

const postSchema = z.object({
  userId: z.string().min(1),
  domainIds: z.array(z.string()).max(200).optional(),
  customDomains: z.array(z.string().min(3)).max(200).optional(),
  tier: z.nativeEnum(DomainTier).optional()
});

const deleteSchema = z.object({ userId: z.string().min(1), domainId: z.string().min(1) });

export async function GET(request: NextRequest) {
  if (!assertAdmin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const parsed = getSchema.safeParse({ userId: url.searchParams.get("userId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const domainIds = await getUserDomainIds(parsed.data.userId);
  const domains = domainIds.length
    ? await prisma.domain.findMany({ where: { id: { in: domainIds } }, orderBy: { name: "asc" } })
    : [];

  return NextResponse.json({ domains });
}

export async function POST(request: NextRequest) {
  if (!assertAdmin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { userId, domainIds = [], customDomains = [], tier = DomainTier.PREMIUM } = parsed.data;

  for (const domainId of domainIds) {
    const exists = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } });
    if (!exists) continue;
    await assignDomainToUser(userId, domainId, false);
  }

  for (const input of customDomains) {
    const name = normalizeDomain(input);
    try {
      assertIssuanceDomain(name);
    } catch {
      continue;
    }

    const domain = await prisma.domain.upsert({
      where: { name },
      update: { status: DomainStatus.active, tier },
      create: { name, tier, status: DomainStatus.active, maxMailboxes: 500 }
    });

    await assignDomainToUser(userId, domain.id, true);
  }

  const assignedIds = await getUserDomainIds(userId);
  const domains = assignedIds.length ? await prisma.domain.findMany({ where: { id: { in: assignedIds } } }) : [];

  return NextResponse.json({ ok: true, domains });
}

export async function DELETE(request: NextRequest) {
  if (!assertAdmin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await unassignDomainFromUser(parsed.data.userId, parsed.data.domainId);
  return NextResponse.json({ ok: true });
}
