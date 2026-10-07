-- AlterTable
ALTER TABLE "AuthorizedRepository"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "repositoryOwner" TEXT,
  ADD COLUMN "repositoryName" TEXT,
  ADD COLUMN "authorizationStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "grantedScopes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuthorizedRepository_userId_provider_authorizationStatus_idx"
  ON "AuthorizedRepository"("userId","provider","authorizationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedRepository_userId_provider_repositoryIdentifier_key"
  ON "AuthorizedRepository"("userId","provider","repositoryIdentifier");