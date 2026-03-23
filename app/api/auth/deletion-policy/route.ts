import { NextRequest, NextResponse } from "next/server";
import { DeletionInterval } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { buildDeleteAt } from "@/lib/server/auth";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const schema = z.object({ interval: z.nativeEnum(DeletionInterval) });
const logger = createLogger("api.auth.deletion-policy");

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        deletionInterval: parsed.data.interval,
        deleteAt: buildDeleteAt(parsed.data.interval)
      },
      select: { deletionInterval: true, deleteAt: true }
    });

    return NextResponse.json({ user });
  } catch (error) {
    await captureException(error, { path: "/api/auth/deletion-policy", method: "PATCH" });
    logger.error("api.auth.deletion_policy.failed", { path: "/api/auth/deletion-policy", method: "PATCH", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
