-- privacy: remove per-session user metadata and add deterministic key lookup
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "keyLookupHash" TEXT;
UPDATE "User" SET "keyLookupHash" = md5("keyHash") WHERE "keyLookupHash" IS NULL;
ALTER TABLE "User" ALTER COLUMN "keyLookupHash" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_keyLookupHash_key" ON "User"("keyLookupHash");

ALTER TABLE "Session" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "userAgent";

-- payments: persist target upgrade plan/tier
DO $$ BEGIN
  CREATE TYPE "PaymentPlan" AS ENUM ('PREMIUM_MONTHLY', 'UNLIMITED_LIFETIME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "targetTier" "Tier";
UPDATE "Payment" SET "targetTier" = 'PREMIUM' WHERE "targetTier" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "targetTier" SET NOT NULL;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "plan" "PaymentPlan";
UPDATE "Payment" SET "plan" = 'PREMIUM_MONTHLY' WHERE "plan" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "plan" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Payment_targetTier_plan_idx" ON "Payment"("targetTier", "plan");

-- move user domain access into managed schema
CREATE TABLE IF NOT EXISTS "UserDomainAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDomainAccess_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserDomainAccess" ("id", "userId", "domainId", "isCustom", "createdAt")
SELECT
  COALESCE(id, md5(random()::text || clock_timestamp()::text)),
  user_id,
  domain_id,
  COALESCE(is_custom, false),
  COALESCE(created_at, NOW())
FROM user_domain_access
ON CONFLICT ("userId", "domainId") DO NOTHING;

DROP TABLE IF EXISTS user_domain_access;

CREATE UNIQUE INDEX IF NOT EXISTS "UserDomainAccess_userId_domainId_key" ON "UserDomainAccess"("userId", "domainId");
CREATE INDEX IF NOT EXISTS "UserDomainAccess_userId_idx" ON "UserDomainAccess"("userId");
CREATE INDEX IF NOT EXISTS "UserDomainAccess_domainId_idx" ON "UserDomainAccess"("domainId");

ALTER TABLE "UserDomainAccess"
  ADD CONSTRAINT "UserDomainAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDomainAccess"
  ADD CONSTRAINT "UserDomainAccess_domainId_fkey"
  FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
