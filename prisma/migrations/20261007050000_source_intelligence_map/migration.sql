CREATE TABLE "SourceIntelligenceReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "rationale" TEXT,
  "priority" TEXT,
  "accessStatus" TEXT,
  "implementationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceIntelligenceReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SourceIntelligenceReview_userId_sourceId_key" ON "SourceIntelligenceReview"("userId","sourceId");
CREATE INDEX "SourceIntelligenceReview_userId_updatedAt_idx" ON "SourceIntelligenceReview"("userId","updatedAt");
ALTER TABLE "SourceIntelligenceReview" ADD CONSTRAINT "SourceIntelligenceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
