import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/server/auth";
import { z } from "zod";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logoutSchema = z.object({
  token: z.string().min(10).optional()
});

const logger = createLogger("api.auth.logout");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const cookieToken = request.cookies.get("akm_token")?.value;
    const rawToken = parsed.data.token || cookieToken;
    if (!rawToken) {
      return NextResponse.json({ error: "Session token missing" }, { status: 400 });
    }

    const tokenHash = hashToken(rawToken);
    const session = await prisma.session.findUnique({ where: { tokenHash } });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await prisma.session.deleteMany({
      where: { userId: session.userId }
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set("akm_token", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    await captureException(error, { path: "/api/auth/logout", method: "POST" });
    logger.error("api.auth.logout.failed", { path: "/api/auth/logout", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
