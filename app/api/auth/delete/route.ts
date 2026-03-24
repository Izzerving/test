import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { hashLookupSecret, hashSecret, verifySecret } from "@/lib/server/auth";
import { randomBytes } from "crypto";
import { z } from "zod";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const schema = z.object({
  key: z.string().min(10).max(20),
  confirm: z.literal(true),
  token: z.string().min(10).optional()
});

const logger = createLogger("api.auth.delete");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const session = await getSessionByToken(parsed.data.token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!verifySecret(parsed.data.key, session.user.keyHash)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.mailbox.updateMany({
        where: { userId: session.userId, deletedAt: null },
        data: { deletedAt: now, isActive: false }
      });

      const invalidatedSecret = randomBytes(32).toString("hex");
      await tx.user.update({
        where: { id: session.userId },
        data: {
          deletedAt: now,
          keyHash: hashSecret(invalidatedSecret),
          keyLookupHash: hashLookupSecret(invalidatedSecret)
        }
      });

      await tx.session.deleteMany({ where: { userId: session.userId } });
    });

    const response = NextResponse.json({ ok: true, deleted: true, mode: "soft-delete" });
    response.cookies.set("akm_token", "", { path: "/", maxAge: 0 });
    response.cookies.set("akm_token_sig", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    await captureException(error, { path: "/api/auth/delete", method: "POST" });
    logger.error("api.auth.delete.failed", { path: "/api/auth/delete", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
