-- Secure GitHub App authorization state and repository metadata
ALTER TABLE "AuthorizedRepository"
  ADD COLUMN "githubRepositoryId" TEXT,
  ADD COLUMN "installationId" TEXT,
  ADD COLUMN "authorizedAt" TIMESTAMP(3);

CREATE TABLE "GithubAuthorizationState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "installationId" TEXT,
  "availableInstallations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GithubAuthorizationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GithubAuthorizationState_stateHash_key" ON "GithubAuthorizationState"("stateHash");
CREATE INDEX "GithubAuthorizationState_userId_expiresAt_idx" ON "GithubAuthorizationState"("userId","expiresAt");
CREATE INDEX "GithubAuthorizationState_expiresAt_idx" ON "GithubAuthorizationState"("expiresAt");
ALTER TABLE "GithubAuthorizationState" ADD CONSTRAINT "GithubAuthorizationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invalidate legacy GitHub records that were not created by the secure App flow.
UPDATE "AuthorizedRepository"
SET "authorizationStatus"='REVOKED',"status"='REVOKED',"revokedAt"=CURRENT_TIMESTAMP
WHERE "provider"='GITHUB' AND "installationId" IS NULL;
