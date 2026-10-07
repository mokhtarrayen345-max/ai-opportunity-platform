import {z} from "zod";

export const repairRiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
export const repairStatusSchema=z.enum(["DRAFT","READY_FOR_REVIEW","APPROVED","REJECTED","SUPERSEDED"]);
export const approvalStatusSchema=z.enum(["NOT_REQUIRED","PENDING","APPROVED","REJECTED"]);
export const repairCategorySchema=z.enum(["CONFIGURATION","FRONTEND","BACKEND","API","DATABASE","PERFORMANCE","SECURITY","INFRASTRUCTURE","INTEGRATION","TESTING","MONITORING","OTHER"]);
export const repairStepSchema=z.object({
 title:z.string().trim().min(3).max(200),
 description:z.string().trim().min(10).max(1500),
 objective:z.string().trim().min(5).max(500),
 category:repairCategorySchema,
 affectedArea:z.string().trim().min(1).max(200),
 dependencies:z.array(z.string().trim().min(1).max(300)).max(10),
 evidenceFindingIds:z.array(z.string().min(1)).min(1).max(20),
 risk:repairRiskSchema,
 estimatedEffortMinutes:z.number().int().min(5).max(480),
 verificationMethod:z.string().trim().min(10).max(700),
 rollbackAction:z.string().trim().min(10).max(700),
 requiresApproval:z.boolean()
});
export const repairPlanDraftSchema=z.object({
 title:z.string().trim().min(3).max(200),
 summary:z.string().trim().min(10).max(2000),
 facts:z.array(z.string().trim().min(1).max(600)).max(20),
 hypotheses:z.array(z.string().trim().min(1).max(600)).max(20),
 assumptions:z.array(z.string().trim().min(1).max(600)).max(20),
 unknowns:z.array(z.string().trim().min(1).max(600)).max(20),
 limitations:z.array(z.string().trim().min(1).max(600)).max(20),
 steps:z.array(repairStepSchema).min(1).max(20),
 overallRisk:repairRiskSchema,
 estimatedEffortMinutes:z.number().int().min(5).max(4800),
 estimatedEffortRange:z.string().trim().min(5).max(100),
 confidence:z.number().int().min(0).max(100)
});
export type RepairPlanDraft=z.infer<typeof repairPlanDraftSchema>;
export type RepairPlanningContext={diagnosisRunId:string;target:{url:string;type:string};findings:Array<{id:string;category:string;title:string;description:string;severity:string;confidence:number;observedValue?:string|null;expectedValue?:string|null;rootCauseHypothesis?:string|null;facts:string[];hypotheses:string[];unknowns:string[];recommendation:string;estimatedEffortMinutes:number}>};

const rank={INFO:0,LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4} as Record<string,number>;
export function validateRepairDraft(draft:RepairPlanDraft,ctx:RepairPlanningContext){
 const ids=new Set(ctx.findings.map(f=>f.id));
 for(const s of draft.steps){
  if(s.evidenceFindingIds.some(id=>!ids.has(id))) throw new Error("Repair plan referenced an unknown diagnosis finding.");
 }
 const computedRisk=draft.steps.some(s=>s.risk==="CRITICAL")?"CRITICAL":draft.steps.some(s=>s.risk==="HIGH")?"HIGH":draft.steps.some(s=>s.risk==="MEDIUM")?"MEDIUM":"LOW";
 const maxFinding=Math.max(0,...ctx.findings.map(f=>rank[f.severity]??0));
 if(rank[draft.overallRisk]<maxFinding) draft.overallRisk=maxFinding>=4?"CRITICAL":maxFinding>=3?"HIGH":maxFinding>=2?"MEDIUM":"LOW";
 if(rank[draft.overallRisk]<rank[computedRisk])draft.overallRisk=computedRisk;
 for(const s of draft.steps){if(s.risk==="HIGH"||s.risk==="CRITICAL")s.requiresApproval=true;if(s.category==="DATABASE"||s.category==="SECURITY"||s.category==="INFRASTRUCTURE")s.requiresApproval=true;}
 draft.estimatedEffortMinutes=Math.min(4800,Math.max(5,draft.steps.reduce((n,s)=>n+s.estimatedEffortMinutes,0)));
 return draft;
}
export function effortRange(minutes:number){if(minutes<60)return "approximately 30–60 minutes";const h=Math.ceil(minutes/60);return `approximately ${Math.max(1,h-1)}–${Math.max(2,h+1)} hours`;}
