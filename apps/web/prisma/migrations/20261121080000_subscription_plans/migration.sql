CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

ALTER TABLE "Organization"
ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
