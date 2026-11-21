ALTER TABLE "SecurityAlert"
  ADD COLUMN "lastNotifiedAt" TIMESTAMP(3);

CREATE INDEX "SecurityAlert_status_lastNotifiedAt_idx"
  ON "SecurityAlert"("status", "lastNotifiedAt");
