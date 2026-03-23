import { randomBytes } from "crypto";
import { getRedis } from "@/lib/server/redis";

const TOKEN_TTL_SEC = Number(process.env.REALTIME_TOKEN_TTL_SEC || 300);
const REPLAY_LIMIT = Number(process.env.REALTIME_REPLAY_LIMIT || 100);

function tokenKey(token: string) {
  return `rt:token:${token}`;
}

function eventKey(channel: string) {
  return `rt:events:${channel}`;
}

function seqKey(channel: string) {
  return `rt:seq:${channel}`;
}

export async function issueRealtimeToken(userId: string) {
  const token = randomBytes(24).toString("hex");
  await getRedis().set(tokenKey(token), userId, "EX", TOKEN_TTL_SEC);
  return token;
}

export async function verifyRealtimeToken(token: string) {
  return getRedis().get(tokenKey(token));
}

export async function revokeRealtimeToken(token: string) {
  await getRedis().del(tokenKey(token));
}

export async function appendRealtimeEvent(channel: string, payload: Record<string, unknown>) {
  const redis = getRedis();
  const sequence = await redis.incr(seqKey(channel));
  const envelope = JSON.stringify({
    seq: sequence,
    ts: new Date().toISOString(),
    payload
  });

  const key = eventKey(channel);
  await redis.multi().rpush(key, envelope).ltrim(key, -REPLAY_LIMIT, -1).publish(channel, envelope).exec();
  return sequence;
}

export async function getReplayEvents(channel: string, afterSeq = 0) {
  const raw = await getRedis().lrange(eventKey(channel), 0, -1);
  const items: Array<{ seq: number; ts: string; payload: Record<string, unknown> }> = [];
  for (const row of raw) {
    try {
      const parsed = JSON.parse(row) as { seq?: number; ts?: string; payload?: Record<string, unknown> };
      if (!parsed.seq || parsed.seq <= afterSeq || !parsed.ts || !parsed.payload) continue;
      items.push({ seq: parsed.seq, ts: parsed.ts, payload: parsed.payload });
    } catch {
      // ignore malformed rows
    }
  }
  return items;
}
