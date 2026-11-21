CREATE TYPE "SecurityAlertSeverity" AS ENUM ('MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SecurityAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "SecurityAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" TEXT NOT NULL,
  "severity" "SecurityAlertSeverity" NOT NULL,
  "status" "SecurityAlertStatus" NOT NULL DEFAULT 'OPEN',
  "fingerprint" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityAlert_organizationId_fingerprint_key"
  ON "SecurityAlert"("organizationId", "fingerprint");
CREATE INDEX "SecurityAlert_organizationId_status_severity_lastSeenAt_idx"
  ON "SecurityAlert"("organizationId", "status", "severity", "lastSeenAt");
ALTER TABLE "SecurityAlert"
  ADD CONSTRAINT "SecurityAlert_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
