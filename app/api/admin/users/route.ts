import { DeletionInterval, Tier } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestHasAdminAccess } from "@/lib/server/admin";

const querySchema = z.object({
  q: z.string().optional(),
  tier: z.nativeEnum(Tier).optional(),
  deletionInterval: z.nativeEnum(DeletionInterval).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50)
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), userId: z.string().min(1) }),
  z.object({ action: z.literal("unblock"), userId: z.string().min(1) }),
  z.object({ action: z.literal("change-tier"), userId: z.string().min(1), tier: z.nativeEnum(Tier) })
]);

export async function GET(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") || undefined,
    tier: url.searchParams.get("tier") || undefined,
    deletionInterval: url.searchParams.get("deletionInterval") || undefined,
    take: url.searchParams.get("take") || undefined
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const { q, tier, deletionInterval, take } = parsed.data;
  const users = await prisma.user.findMany({
    where: {
      ...(tier ? { tier } : {}),
      ...(deletionInterval ? { deletionInterval } : {}),
      ...(q
        ? {
            OR: [{ publicId: { contains: q, mode: "insensitive" } }, { id: { contains: q, mode: "insensitive" } }]
          }
        : {})
    },
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      publicId: true,
      tier: true,
      deletionInterval: true,
      deleteAt: true,
      createdAt: true
    }
  });

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      deleteAt: user.deleteAt.toISOString(),
      createdAt: user.createdAt.toISOString()
    }))
  });
}

export async function PATCH(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (parsed.data.action === "block") {
    await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
    });
    return NextResponse.json({ ok: true, message: "Пользователь заблокирован на 1 день." });
  }

  if (parsed.data.action === "unblock") {
    await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { deleteAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) }
    });
    return NextResponse.json({ ok: true, message: "Блокировка снята." });
  }

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { tier: parsed.data.tier }
  });
  return NextResponse.json({ ok: true, message: "Тариф пользователя изменён." });
}

export async function DELETE(request: NextRequest) {
  if (!requestHasAdminAccess(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
