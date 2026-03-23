import { NextResponse } from "next/server";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.auth.sessions");

export async function GET() {
  try {
    const session = await getSessionByToken();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ sessions: [] });
  } catch (error) {
    await captureException(error, { path: "/api/auth/sessions", method: "GET" });
    logger.error("api.auth.sessions.failed", { path: "/api/auth/sessions", method: "GET", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
