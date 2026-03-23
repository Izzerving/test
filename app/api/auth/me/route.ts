import { NextResponse } from "next/server";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.auth.me");

export async function GET() {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        publicId: session.user.publicId,
        tier: session.user.tier,
        deletionInterval: session.user.deletionInterval,
        deleteAt: session.user.deleteAt,
        referralCode: session.user.referralCode
      }
    });
  } catch (error) {
    await captureException(error, { path: "/api/auth/me", method: "GET" });
    logger.error("api.auth.me.failed", { path: "/api/auth/me", method: "GET", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
