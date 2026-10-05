// SPDX-License-Identifier: MIT
// Minimal structured logger for the server. Emits one JSON object per line so
// logs can be collected without parsing prose. Level is controlled by
// `OPENEXPERT_LOG_LEVEL` (default: debug in development, info otherwise).

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = process.env["OPENEXPERT_LOG_LEVEL"] as Level | undefined;
  if (raw && raw in LEVELS) return LEVELS[raw];
  return process.env["NODE_ENV"] === "production" ? LEVELS.info : LEVELS.debug;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function describe(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { error: error.message, stack: error.stack };
  return { error: String(error) };
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, error?: unknown, meta?: Record<string, unknown>) =>
    emit("error", message, { ...describe(error), ...meta }),
};
