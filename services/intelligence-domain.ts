import { z } from "zod";

export const signalTypes = ["problem_report","user_complaint","product_failure","market_change","business_opportunity","technology_change","startup_signal","trend","other"] as const;
export const sourceTypes = ["mock","news","social","github","web","other"] as const;

export const rawSourceItemSchema = z.object({
  title:z.string().trim().min(1).max(300),
  summary:z.string().trim().min(1).max(2000),
  sourceType:z.enum(sourceTypes),
  sourceName:z.string().trim().min(1).max(160),
  sourceUrl:z.string().url().max(2000).optional(),
  externalId:z.string().trim().min(1).max(300).optional(),
  detectedAt:z.coerce.date().optional(),
  receivedAt:z.coerce.date().optional(),
  topic:z.string().trim().min(1).max(160),
  entities:z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  rawContent:z.string().trim().min(1).max(10000),
  rawReference:z.string().trim().max(1000).optional(),
  metadata:z.record(z.string(),z.unknown()).default({}),
});
export type RawSourceItem=z.infer<typeof rawSourceItemSchema>;

export const intelligenceSignalSchema=z.object({
  id:z.string().min(1), title:z.string().trim().min(1), summary:z.string().trim().min(1),
  sourceType:z.enum(sourceTypes), sourceName:z.string().trim().min(1),
  sourceUrl:z.string().url().optional(), externalId:z.string().optional(),
  detectedAt:z.string().datetime(), receivedAt:z.string().datetime(),
  topic:z.string().trim().min(1), entities:z.array(z.string()),
  signalType:z.enum(signalTypes), rawContent:z.string().min(1), rawReference:z.string().optional(),
  normalizedContent:z.string().min(1),
  sourceFacts:z.array(z.string()), aiInterpretation:z.array(z.string()),
  assumptions:z.array(z.string()), unknowns:z.array(z.string()),
  confidence:z.number().int().min(0).max(100), metadata:z.record(z.string(),z.unknown()),
  fingerprint:z.string().regex(/^[a-f0-9]{64}$/),
  opportunityAnalysisStatus:z.enum(["not_analyzed","analyzed"]),
  lastOpportunityAnalyzedAt:z.string().datetime().optional(),
  createdAt:z.string().datetime(),
});
export type IntelligenceSignal=z.infer<typeof intelligenceSignalSchema>;

export function normalizeRawSourceItem(raw:RawSourceItem):Omit<IntelligenceSignal,"id"|"fingerprint"|"opportunityAnalysisStatus"|"lastOpportunityAnalyzedAt"|"createdAt">{
  const detected=raw.detectedAt??raw.receivedAt??new Date();
  const received=raw.receivedAt??new Date();
  return {
    title:raw.title.trim(), summary:raw.summary.trim(), sourceType:raw.sourceType, sourceName:raw.sourceName.trim(),
    sourceUrl:raw.sourceUrl, externalId:raw.externalId, detectedAt:detected.toISOString(), receivedAt:received.toISOString(),
    topic:raw.topic.trim(), entities:[...new Set(raw.entities.map(x=>x.trim()).filter(Boolean))],
    signalType:"other", rawContent:raw.rawContent.trim(), rawReference:raw.rawReference?.trim(),
    normalizedContent:[raw.title.trim(),raw.summary.trim(),raw.rawContent.trim()].join("\n\n"),
    sourceFacts:[raw.title.trim(),raw.summary.trim()], aiInterpretation:[], assumptions:[], unknowns:[],
    confidence:70, metadata:raw.metadata,
  };
}
