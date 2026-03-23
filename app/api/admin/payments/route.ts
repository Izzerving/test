import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  method: z.nativeEnum(PaymentMethod).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  take: z.coerce.number().int().min(1).max(200).default(100)
});

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_SUPER_KEY || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    method: url.searchParams.get("method") || undefined,
    status: url.searchParams.get("status") || undefined,
    take: url.searchParams.get("take") || undefined
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const { method, status, take } = parsed.data;
  const payments = await prisma.payment.findMany({
    where: {
      ...(method ? { method } : {}),
      ...(status ? { status } : {})
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      targetTier: true,
      plan: true,
      method: true,
      status: true,
      amountUsd: true,
      currency: true,
      externalId: true,
      confirmations: true,
      retryCount: true,
      createdAt: true,
      confirmedAt: true
    }
  });

  return NextResponse.json({ payments });
}
