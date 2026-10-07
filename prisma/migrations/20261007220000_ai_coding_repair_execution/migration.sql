CREATE TABLE "AuthorizedRepository" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "repositoryIdentifier" TEXT NOT NULL,
  "workspaceRef" TEXT NOT NULL,
  "defaultBranch" TEXT NOT NULL DEFAULT 'main',
  "allowedBranches" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthorizedRepository_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthorizedRepository_workspaceRef_key" ON "AuthorizedRepository"("workspaceRef");
CREATE INDEX "AuthorizedRepository_userId_createdAt_idx" ON "AuthorizedRepository"("userId","createdAt");
CREATE INDEX "AuthorizedRepository_userId_status_idx" ON "AuthorizedRepository"("userId","status");
CREATE TABLE "RepairExecution" (
  "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"repairPlanId" TEXT NOT NULL,"authorizedRepositoryId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',"authorizationStatus" TEXT NOT NULL DEFAULT 'NOT_AUTHORIZED',"workspaceId" TEXT,"branchName" TEXT,
  "startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),"error" TEXT,"summary" TEXT,"authorizedAt" TIMESTAMP(3),"authorizedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairExecution_userId_createdAt_idx" ON "RepairExecution"("userId","createdAt");
CREATE INDEX "RepairExecution_userId_status_idx" ON "RepairExecution"("userId","status");
CREATE INDEX "RepairExecution_userId_repairPlanId_idx" ON "RepairExecution"("userId","repairPlanId");
CREATE INDEX "RepairExecution_userId_authorizationStatus_idx" ON "RepairExecution"("userId","authorizationStatus");
CREATE TABLE "RepairExecutionEvent" (
  "id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"repairStepId" TEXT,"message" TEXT NOT NULL,"status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RepairExecutionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairExecutionEvent_executionId_createdAt_idx" ON "RepairExecutionEvent"("executionId","createdAt");
CREATE TABLE "RepairChange" (
  "id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"repairStepId" TEXT,"filePath" TEXT NOT NULL,"changeType" TEXT NOT NULL,"reason" TEXT NOT NULL,
  "validationResult" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RepairChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairChange_executionId_createdAt_idx" ON "RepairChange"("executionId","createdAt");
CREATE TABLE "RepairTestResult" (
  "id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"repairStepId" TEXT,"command" TEXT NOT NULL,"status" TEXT NOT NULL,"outputSummary" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,"completedAt" TIMESTAMP(3),CONSTRAINT "RepairTestResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairTestResult_executionId_createdAt_idx" ON "RepairTestResult"("executionId","startedAt");
CREATE INDEX "RepairTestResult_executionId_status_idx" ON "RepairTestResult"("executionId","status");
CREATE TABLE "RepairVerificationResult" (
  "id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"repairStepId" TEXT,"method" TEXT NOT NULL,"status" TEXT NOT NULL,"details" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RepairVerificationResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairVerificationResult_executionId_createdAt_idx" ON "RepairVerificationResult"("executionId","createdAt");
ALTER TABLE "AuthorizedRepository" ADD CONSTRAINT "AuthorizedRepository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairExecution" ADD CONSTRAINT "RepairExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairExecution" ADD CONSTRAINT "RepairExecution_repairPlanId_fkey" FOREIGN KEY ("repairPlanId") REFERENCES "RepairPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairExecution" ADD CONSTRAINT "RepairExecution_authorizedRepositoryId_fkey" FOREIGN KEY ("authorizedRepositoryId") REFERENCES "AuthorizedRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairExecutionEvent" ADD CONSTRAINT "RepairExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RepairExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairChange" ADD CONSTRAINT "RepairChange_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RepairExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairTestResult" ADD CONSTRAINT "RepairTestResult_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RepairExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairVerificationResult" ADD CONSTRAINT "RepairVerificationResult_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RepairExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;