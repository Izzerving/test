import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendRealtimeEvent } from "@/lib/server/realtime";

const schema = z.object({
  channel: z.string().min(3).regex(/^user:[a-z0-9]+$/i, "Only user:* channels are allowed"),
  payload: z.record(z.any())
});

export async function POST(request: NextRequest) {
  const internalKey = request.headers.get("x-internal-key");
  if (!process.env.INGEST_API_KEY || internalKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const seq = await appendRealtimeEvent(parsed.data.channel, parsed.data.payload);
  return NextResponse.json({ ok: true, seq });
}
