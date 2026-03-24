-- Add new lifecycle state for domains
ALTER TYPE "DomainStatus" ADD VALUE IF NOT EXISTS 'draft';

-- Seed settings for optional startup bonus for new users
INSERT INTO "GlobalSetting" ("id", "key", "value", "description", "updatedAt")
VALUES
  ('seed_startup_bonus_enabled', 'startup_bonus_enabled', 'false', 'Enable startup bonus for all new registrations', CURRENT_TIMESTAMP),
  ('seed_startup_bonus_usd', 'startup_bonus_usd', '2.00', 'Startup bonus amount in USD for new registrations', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;
