-- Atomic, per-API-key ingestion quota state.
-- One row per key is reused for each fixed one-minute window.
CREATE TABLE "IngestionRateLimit" (
  "apiKeyId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "eventCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IngestionRateLimit_pkey" PRIMARY KEY ("apiKeyId")
);

ALTER TABLE "IngestionRateLimit"
  ADD CONSTRAINT "IngestionRateLimit_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
