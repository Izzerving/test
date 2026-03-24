import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateSessionToken,
  createSessionCookieSignature,
  hashLookupSecret,
  hashToken,
  verifySecret,
} from "@/lib/server/auth";
import { z } from "zod";
import {
  captureException,
  createLogger,
  getErrorMessage,
} from "@/lib/server/observability";

const loginSchema = z.object({
  key: z.string().min(10).max(20),
});

const logger = createLogger("api.auth.login");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const lookupHash = hashLookupSecret(parsed.data.key);
    const directUser = await prisma.user.findUnique({
      where: { keyLookupHash: lookupHash },
      select: {
        id: true,
        keyHash: true,
        publicId: true,
        tier: true,
        deletedAt: true,
      },
    });
    const fallbackUsers = directUser
      ? []
      : await prisma.user.findMany({
          select: {
            id: true,
            keyHash: true,
            publicId: true,
            tier: true,
            keyLookupHash: true,
            deletedAt: true,
          },
        });
    const user =
      directUser && verifySecret(parsed.data.key, directUser.keyHash)
        ? directUser
        : fallbackUsers.find((candidate) =>
            verifySecret(parsed.data.key, candidate.keyHash),
          );

    if (!user) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    if (user.deletedAt) {
      return NextResponse.json({ error: "Account deleted" }, { status: 403 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    const ip =
      forwardedFor.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || null;

    if (!directUser) {
      await prisma.user
        .update({
          where: { id: user.id },
          data: { keyLookupHash: lookupHash },
        })
        .catch(() => null);
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);

    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash,
        },
        select: { id: true, createdAt: true },
      });

      await tx.loginLog.create({
        data: {
          userId: user.id,
          ip,
          userAgent,
        },
      });

      return session;
    });

    const response = NextResponse.json({
      sessionId: created.id,
      user: { publicId: user.publicId, tier: user.tier },
    });

    response.cookies.set("akm_token", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    const tokenSig = createSessionCookieSignature(sessionToken);
    if (tokenSig) {
      response.cookies.set("akm_token_sig", tokenSig, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    await captureException(error, { path: "/api/auth/login", method: "POST" });
    logger.error("api.auth.login.failed", {
      path: "/api/auth/login",
      method: "POST",
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
