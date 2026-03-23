import { z } from "zod";

const requiredEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXT_PUBLIC_APP_DOMAIN: z.string().min(1),
  PRIMARY_MAIL_DOMAIN: z.string().min(1),
  ADMIN_SUPER_KEY: z.string().min(1),
  INGEST_API_KEY: z.string().min(1)
});

export type EnvHealth = {
  ok: boolean;
  missingKeys: string[];
};

export function getEnvHealth(env: NodeJS.ProcessEnv = process.env): EnvHealth {
  const parsed = requiredEnvSchema.safeParse(env);
  if (parsed.success) {
    return { ok: true, missingKeys: [] };
  }

  const keys = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") keys.add(key);
  }

  return {
    ok: keys.size === 0,
    missingKeys: [...keys].sort()
  };
}
