import { NextResponse } from "next/server";
import { getEnvHealth } from "@/lib/server/env";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/server/redis";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";
import { exec } from "child_process";
import { promisify } from "util";
import { WebSocket } from "ws";

const logger = createLogger("api.health");
const execAsync = promisify(exec);
const strictMode = process.env.HEALTH_STRICT_MODE === "true";

async function checkDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function checkRedis() {
  try {
    const pong = await getRedis().ping();
    return { ok: pong === "PONG", response: pong };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function checkPostfix() {
  if (!strictMode && process.env.HEALTHCHECK_POSTFIX_REQUIRED !== "true") {
    return { ok: true, skipped: true, reason: "optional" };
  }
  try {
    const command = `sh -lc "command -v telnet >/dev/null 2>&1 && printf 'quit\\n' | timeout 3 telnet 127.0.0.1 25"`;
    const { stdout, stderr } = await execAsync(command);
    const output = `${stdout || ""}${stderr || ""}`;
    const ok = /(Connected to|Escape character|220)/i.test(output);
    return { ok, output: output.trim().slice(0, 120) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function checkRealtime() {
  if (!strictMode && process.env.HEALTHCHECK_REALTIME_REQUIRED !== "true") {
    return { ok: true, skipped: true, reason: "optional" };
  }

  const port = Number(process.env.REALTIME_PORT || 3001);
  return new Promise<{ ok: boolean; error?: string; responseType?: string }>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({ ok: false, error: "timeout" });
    }, 2500);

    ws.on("message", (raw) => {
      clearTimeout(timeout);
      ws.close();
      try {
        const parsed = JSON.parse(raw.toString());
        resolve({ ok: true, responseType: String(parsed?.type || "unknown") });
      } catch {
        resolve({ ok: true, responseType: "non-json" });
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: getErrorMessage(error) });
    });
  });
}

export async function GET() {
  try {
    const envHealth = getEnvHealth();
    const [db, redis, postfix, realtime] = await Promise.all([
      checkDb(),
      checkRedis(),
      checkPostfix(),
      checkRealtime()
    ]);

    const ok = envHealth.ok && db.ok && redis.ok && postfix.ok && realtime.ok;
    return NextResponse.json({
      ok,
      strictMode,
      service: "anonkeymail",
      ts: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      checks: { env: envHealth, db, redis, postfix, realtime }
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    await captureException(error, { path: "/api/health", method: "GET" });
    logger.error("api.health.failed", { path: "/api/health", method: "GET", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
