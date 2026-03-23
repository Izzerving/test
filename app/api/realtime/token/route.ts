import { NextResponse } from "next/server";
import { getSessionByToken } from "@/lib/server/session";
import { issueRealtimeToken } from "@/lib/server/realtime";

export async function POST() {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await issueRealtimeToken(session.userId);
  return NextResponse.json({ token, channel: `user:${session.userId}`, expiresInSec: Number(process.env.REALTIME_TOKEN_TTL_SEC || 300) });
}
