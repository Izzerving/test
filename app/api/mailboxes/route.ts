import { NextRequest, NextResponse } from "next/server";
import { DomainStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { canUseCustomAddress, domainTierForUserTier, tierExtendOptions, tierMailboxLimit } from "@/lib/server/tier";
import { isServiceWebDomain } from "@/lib/server/domain-policy";
import { generateReadableLocalPart } from "@/lib/server/mailbox-localpart";
import { getUserDomainIds } from "@/lib/server/user-domain-access";

const createSchema = z.object({
  random: z.boolean().optional().default(true),
  domain: z.string().optional(),
  username: z.string().min(3).max(24).regex(/^[a-z0-9]+$/).optional(),
  extendMinutes: z.number().int().positive().optional().default(30)
});

const extendSchema = z.object({
  mailboxId: z.string(),
  minutes: z.number().int().positive()
});

const deleteSchema = z.object({ mailboxId: z.string() });

export async function GET() {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mailboxes = await prisma.mailbox.findMany({
    where: { userId: session.userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      address: true,
      isActive: true,
      expiresAt: true,
      createdAt: true
    }
  });

  return NextResponse.json({ mailboxes });
}

export async function POST(request: NextRequest) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const userTier = session.user.tier;
  const activeCount = await prisma.mailbox.count({ where: { userId: session.userId, isActive: true, deletedAt: null } });
  if (activeCount >= tierMailboxLimit[userTier]) {
    return NextResponse.json({ error: "Tier mailbox limit reached" }, { status: 400 });
  }

  if (!tierExtendOptions[userTier].includes(parsed.data.extendMinutes)) {
    return NextResponse.json({ error: "Invalid extension for current tier" }, { status: 400 });
  }

  const domainTier = domainTierForUserTier(userTier);
  const poolDomains = await prisma.domain.findMany({
    where: {
      tier: domainTier,
      status: DomainStatus.active,
    }
  });
  const assignedDomainIds = await getUserDomainIds(session.userId);
  const assignedDomains = assignedDomainIds.length
    ? await prisma.domain.findMany({
        where: {
          id: { in: assignedDomainIds },
          tier: domainTier,
          status: DomainStatus.active
        }
      })
    : [];

  const mergedDomains = [...poolDomains, ...assignedDomains];
  const uniqDomains = Array.from(new Map(mergedDomains.map((d) => [d.id, d])).values());
  const availableDomains = uniqDomains.filter((d) => !isServiceWebDomain(d.name) && d.currentMailboxes < d.maxMailboxes);

  if (!availableDomains.length) {
    return NextResponse.json({ error: "No active domains in pool" }, { status: 400 });
  }

  let chosenDomain = availableDomains[Math.floor(Math.random() * availableDomains.length)];
  let localPart = generateReadableLocalPart();

  if (canUseCustomAddress(userTier) && parsed.data.random === false && parsed.data.domain && parsed.data.username) {
    const manualDomain = availableDomains.find((d) => d.name === parsed.data.domain);
    if (!manualDomain) {
      return NextResponse.json({ error: "Domain unavailable" }, { status: 400 });
    }
    chosenDomain = manualDomain;
    localPart = parsed.data.username;
  }

  const address = `${localPart}@${chosenDomain.name}`;
  const expiresAt = new Date(Date.now() + parsed.data.extendMinutes * 60 * 1000);

  const mailbox = await prisma.mailbox.create({
    data: {
      userId: session.userId,
      domainId: chosenDomain.id,
      localPart,
      address,
      expiresAt,
      isGuest: false
    }
  });

  const nextCount = chosenDomain.currentMailboxes + 1;
  await prisma.domain.update({
    where: { id: chosenDomain.id },
    data: {
      currentMailboxes: { increment: 1 },
      status: nextCount >= chosenDomain.maxMailboxes ? DomainStatus.exhausted : DomainStatus.active
    }
  });

  return NextResponse.json({ mailbox });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = extendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (!tierExtendOptions[session.user.tier].includes(parsed.data.minutes)) {
    return NextResponse.json({ error: "Invalid extension for current tier" }, { status: 400 });
  }

  const mailbox = await prisma.mailbox.findFirst({ where: { id: parsed.data.mailboxId, userId: session.userId, deletedAt: null } });
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  const extended = await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: { expiresAt: new Date(mailbox.expiresAt.getTime() + parsed.data.minutes * 60 * 1000) }
  });

  return NextResponse.json({ mailbox: extended });
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const mailbox = await prisma.mailbox.findFirst({ where: { id: parsed.data.mailboxId, userId: session.userId, deletedAt: null } });
  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

  await prisma.mailbox.delete({ where: { id: mailbox.id } });
  return NextResponse.json({ ok: true, deleted: true });
}
