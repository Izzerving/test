import Redis from "ioredis";

let singleton: Redis | null = null;

export function getRedis() {
  if (!singleton) {
    singleton = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false
    });
  }
  return singleton;
}
