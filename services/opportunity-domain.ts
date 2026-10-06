import { z } from "zod";

export const evidenceSchema=z.object({text:z.string().trim().min(1).max(500),source:z.enum(["user_fact","ai_hypothesis","assumption","unknown"])});
export const opportunityDraftSchema=z.object({
 title:z.string().trim().min(3).max(160),shortSummary:z.string().trim().min(10).max(500),problemStatement:z.string().trim().min(10).max(1200),
 targetUsers:z.array(z.string().trim().min(1).max(160)).min(1).max(8),marketDomain:z.string().trim().min(2).max(120),
 painSeverity:z.number().int().min(0).max(100),demandSignals:z.array(evidenceSchema).max(8),existingAlternatives:z.array(evidenceSchema).max(8),
 proposedSolutionDirection:z.string().trim().min(10).max(1200),monetizationPossibilities:z.array(z.string().trim().min(1).max(300)).max(8),
 estimatedDifficulty:z.number().int().min(0).max(100),technicalFeasibility:z.number().int().min(0).max(100),businessPotential:z.number().int().min(0).max(100),
 risks:z.array(z.string().trim().min(1).max(400)).max(10),assumptions:z.array(z.string().trim().min(1).max(400)).max(10),unknowns:z.array(z.string().trim().min(1).max(400)).max(10),
 userProvidedFacts:z.array(z.string().trim().min(1).max(500)).max(10),aiHypotheses:z.array(z.string().trim().min(1).max(500)).max(10),
 recommendedNextStep:z.string().trim().min(10).max(600),
});
export type OpportunityDraft=z.infer<typeof opportunityDraftSchema>;
export const opportunityAssessmentSchema=opportunityDraftSchema.extend({
 dimensionScores:z.object({problemSeverity:z.number().int().min(0).max(100),demandPotential:z.number().int().min(0).max(100),marketPotential:z.number().int().min(0).max(100),competitionPosition:z.number().int().min(0).max(100),technicalFeasibility:z.number().int().min(0).max(100),monetizationPotential:z.number().int().min(0).max(100),executionRisk:z.number().int().min(0).max(100)}),
 dimensionExplanations:z.record(z.string(),z.string()),overallScore:z.number().int().min(0).max(100),confidence:z.number().int().min(0).max(100),createdAt:z.string().datetime(),
});
export type OpportunityAssessment=z.infer<typeof opportunityAssessmentSchema>;
export function opportunityDraftJsonSchema(){return {type:"object",additionalProperties:false,required:["title","shortSummary","problemStatement","targetUsers","marketDomain","painSeverity","demandSignals","existingAlternatives","proposedSolutionDirection","monetizationPossibilities","estimatedDifficulty","technicalFeasibility","businessPotential","risks","assumptions","unknowns","userProvidedFacts","aiHypotheses","recommendedNextStep"],properties:{title:{type:"string"},shortSummary:{type:"string"},problemStatement:{type:"string"},targetUsers:{type:"array",items:{type:"string"}},marketDomain:{type:"string"},painSeverity:{type:"integer",minimum:0,maximum:100},demandSignals:{type:"array",items:{type:"object",additionalProperties:false,required:["text","source"],properties:{text:{type:"string"},source:{type:"string",enum:["user_fact","ai_hypothesis","assumption","unknown"]}}}},existingAlternatives:{type:"array",items:{type:"object",additionalProperties:false,required:["text","source"],properties:{text:{type:"string"},source:{type:"string",enum:["user_fact","ai_hypothesis","assumption","unknown"]}}}},proposedSolutionDirection:{type:"string"},monetizationPossibilities:{type:"array",items:{type:"string"}},estimatedDifficulty:{type:"integer",minimum:0,maximum:100},technicalFeasibility:{type:"integer",minimum:0,maximum:100},businessPotential:{type:"integer",minimum:0,maximum:100},risks:{type:"array",items:{type:"string"}},assumptions:{type:"array",items:{type:"string"}},unknowns:{type:"array",items:{type:"string"}},userProvidedFacts:{type:"array",items:{type:"string"}},aiHypotheses:{type:"array",items:{type:"string"}},recommendedNextStep:{type:"string"}}};}
export function extractUserFacts(input:string):string[]{return input.trim()?[input.trim().slice(0,500)]:[];}
