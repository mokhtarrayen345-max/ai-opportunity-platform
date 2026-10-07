CREATE TABLE "RepairReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "verdict" TEXT NOT NULL,
  "reviewerType" TEXT NOT NULL DEFAULT 'DETERMINISTIC_PLUS_AI',
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "RepairReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RepairReviewFinding" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "filePath" TEXT,
  "ruleId" TEXT NOT NULL,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "recommendation" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairReviewFinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RepairReview_executionId_key" ON "RepairReview"("executionId");
CREATE INDEX "RepairReview_userId_createdAt_idx" ON "RepairReview"("userId","createdAt");
CREATE INDEX "RepairReview_userId_verdict_idx" ON "RepairReview"("userId","verdict");
CREATE INDEX "RepairReviewFinding_reviewId_createdAt_idx" ON "RepairReviewFinding"("reviewId","createdAt");
CREATE INDEX "RepairReviewFinding_reviewId_blocking_idx" ON "RepairReviewFinding"("reviewId","blocking");
CREATE INDEX "RepairReviewFinding_severity_idx" ON "RepairReviewFinding"("severity");
ALTER TABLE "RepairReview" ADD CONSTRAINT "RepairReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairReview" ADD CONSTRAINT "RepairReview_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RepairExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairReviewFinding" ADD CONSTRAINT "RepairReviewFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "RepairReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
