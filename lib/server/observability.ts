import { createHash } from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const minLevel = (process.env.LOG_LEVEL as LogLevel | undefined) || "info";
const privacyMode = (process.env.PRIVACY_LOG_MODE || "strict") === "strict";

function shouldLog(level: LogLevel) {
  return levelPriority[level] >= levelPriority[minLevel];
}

function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (!privacyMode) return value.slice(0, 200);
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.slice(0, 10).map((item) => redactValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entry]) => [key, redactValue(entry)]),
    );
  }
  return String(value);
}

function sanitizePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      privacyMode ? redactValue(value) : value,
    ]),
  );
}

export function createLogger(scope: string) {
  function write(
    level: LogLevel,
    event: string,
    payload: Record<string, unknown> = {},
  ) {
    if (!shouldLog(level)) return;

    const line = JSON.stringify({
      level,
      event,
      scope,
      ts: new Date().toISOString(),
      ...sanitizePayload(payload),
    });

    const output = `${line}\n`;
    if (level === "error") {
      process.stderr.write(output);
      return;
    }
    process.stdout.write(output);
  }

  return {
    debug: (event: string, payload?: Record<string, unknown>) =>
      write("debug", event, payload),
    info: (event: string, payload?: Record<string, unknown>) =>
      write("info", event, payload),
    warn: (event: string, payload?: Record<string, unknown>) =>
      write("warn", event, payload),
    error: (event: string, payload?: Record<string, unknown>) =>
      write("error", event, payload),
  };
}

export async function captureException(
  ...args: [unknown, Record<string, unknown>?]
) {
  void args;
  // privacy-first mode: no third-party telemetry and no remote exception forwarding
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return privacyMode
      ? createHash("sha256").update(error.message).digest("hex").slice(0, 12)
      : error.message;
  }
  return privacyMode
    ? createHash("sha256").update(String(error)).digest("hex").slice(0, 12)
    : String(error);
}

const processLogger = createLogger("process");
let processHooksInstalled = false;

export function installGlobalErrorHandlers() {
  if (processHooksInstalled) return;
  if (typeof process === "undefined" || typeof process.on !== "function")
    return;
  processHooksInstalled = true;

  process.on("unhandledRejection", (reason) => {
    void captureException(reason, { source: "unhandledRejection" });
    processLogger.error("process.unhandled_rejection", {
      source: "unhandledRejection",
      message: getErrorMessage(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    void captureException(error, { source: "uncaughtException" });
    processLogger.error("process.uncaught_exception", {
      source: "uncaughtException",
      message: getErrorMessage(error),
    });
  });
}
