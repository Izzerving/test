import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { z } from "zod";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const schema = z.object({ token: z.string().min(10).optional() });
const logger = createLogger("api.auth.clear-logs");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const session = await getSessionByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.session.deleteMany({
      where: { userId: session.userId }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureException(error, { path: "/api/auth/clear-logs", method: "POST" });
    logger.error("api.auth.clear_logs.failed", { path: "/api/auth/clear-logs", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
