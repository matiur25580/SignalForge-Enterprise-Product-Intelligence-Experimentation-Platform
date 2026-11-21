CREATE TABLE "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "invitedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key"
  ON "OrganizationInvitation"("tokenHash");
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_email_key"
  ON "OrganizationInvitation"("organizationId", "email");
CREATE INDEX "OrganizationInvitation_organizationId_acceptedAt_revokedAt_expiresAt_idx"
  ON "OrganizationInvitation"("organizationId", "acceptedAt", "revokedAt", "expiresAt");
CREATE INDEX "OrganizationInvitation_email_expiresAt_idx"
  ON "OrganizationInvitation"("email", "expiresAt");

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
