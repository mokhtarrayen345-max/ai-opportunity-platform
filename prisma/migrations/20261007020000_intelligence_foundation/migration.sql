CREATE TABLE "IntelligenceSignal" (
"id" TEXT NOT NULL,
"userId" TEXT NOT NULL,
"title" TEXT NOT NULL,
"summary" TEXT NOT NULL,
"sourceType" TEXT NOT NULL,
"sourceName" TEXT NOT NULL,
"sourceUrl" TEXT,
"externalId" TEXT,
"detectedAt" TIMESTAMP(3) NOT NULL,
"receivedAt" TIMESTAMP(3) NOT NULL,
"topic" TEXT NOT NULL,
"entities" JSONB NOT NULL,
"signalType" TEXT NOT NULL,
"rawContent" TEXT NOT NULL,
"rawReference" TEXT,
"normalizedContent" TEXT NOT NULL,
"sourceFacts" JSONB NOT NULL,
"aiInterpretation" JSONB NOT NULL,
"assumptions" JSONB NOT NULL,
"unknowns" JSONB NOT NULL,
"confidence" INTEGER NOT NULL,
"metadata" JSONB NOT NULL,
"fingerprint" TEXT NOT NULL,
"opportunityAnalysisStatus" TEXT NOT NULL DEFAULT 'not_analyzed',
"lastOpportunityAnalyzedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "IntelligenceSignal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntelligenceSignal_userId_fingerprint_key" ON "IntelligenceSignal"("userId","fingerprint");
CREATE INDEX "IntelligenceSignal_userId_sourceType_createdAt_idx" ON "IntelligenceSignal"("userId","sourceType","createdAt");
CREATE INDEX "IntelligenceSignal_userId_receivedAt_idx" ON "IntelligenceSignal"("userId","receivedAt");
CREATE INDEX "IntelligenceSignal_userId_topic_idx" ON "IntelligenceSignal"("userId","topic");
CREATE INDEX "IntelligenceSignal_userId_signalType_idx" ON "IntelligenceSignal"("userId","signalType");
ALTER TABLE "IntelligenceSignal" ADD CONSTRAINT "IntelligenceSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;