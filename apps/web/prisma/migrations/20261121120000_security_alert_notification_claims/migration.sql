ALTER TABLE "SecurityAlert"
  ADD COLUMN "notificationClaimedAt" TIMESTAMP(3),
  ADD COLUMN "notificationClaimToken" TEXT;

CREATE UNIQUE INDEX "SecurityAlert_notificationClaimToken_key"
  ON "SecurityAlert"("notificationClaimToken");

CREATE INDEX "SecurityAlert_notificationClaimedAt_idx"
  ON "SecurityAlert"("notificationClaimedAt");
