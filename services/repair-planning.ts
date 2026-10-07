import "server-only";
import {getPrisma} from "@/lib/db";
import {createProviders} from "@/services/ai";
import {repairPlanDraftSchema,validateRepairDraft,effortRange,type RepairPlanningContext} from "@/services/repair-planning-domain";

export async function createRepairPlan(userId:string,diagnosisRunId:string,planningInstructions?:string){
 const prisma=getPrisma();
 const run=await prisma.diagnosisRun.findFirst({where:{id:diagnosisRunId,userId},include:{target:true,findings:{orderBy:{createdAt:"asc"}}}});
 if(!run)throw new Error("Diagnosis run not found.");
 const ctx:RepairPlanningContext={diagnosisRunId,target:{url:run.target.normalizedUrl,type:run.target.targetType},findings:run.findings.map(f=>({id:f.id,category:f.category,title:f.title,description:f.description,severity:f.severity,confidence:f.confidence,observedValue:f.observedValue,expectedValue:f.expectedValue,rootCauseHypothesis:f.rootCauseHypothesis,facts:Array.isArray(f.facts)?f.facts as string[]:[],hypotheses:Array.isArray(f.hypotheses)?f.hypotheses as string[]:[],unknowns:Array.isArray(f.unknowns)?f.unknowns as string[]:[],recommendation:f.recommendation,estimatedEffortMinutes:f.estimatedEffortMinutes}))};
 if(!ctx.findings.length)throw new Error("Diagnosis has no findings to ground a repair plan.");
 const instruction=planningInstructions?.trim().slice(0,2000);
 const draft=await createProviders().repair.plan(ctx,instruction);
 const parsed=repairPlanDraftSchema.parse(draft);
 const safe=validateRepairDraft(parsed,ctx);
 const plan=await prisma.repairPlan.create({data:{userId,diagnosisRunId,title:safe.title,summary:safe.summary,status:"READY_FOR_REVIEW",overallRisk:safe.overallRisk,estimatedEffortMinutes:safe.estimatedEffortMinutes,estimatedEffortRange:effortRange(safe.estimatedEffortMinutes),confidence:safe.confidence,facts:safe.facts,hypotheses:safe.hypotheses,assumptions:safe.assumptions,unknowns:safe.unknowns,limitations:safe.limitations,requiresApproval:safe.steps.some(s=>s.requiresApproval),approvalStatus:"PENDING",steps:{create:safe.steps.map((s,i)=>({order:i+1,title:s.title,description:s.description,objective:s.objective,category:s.category,affectedArea:s.affectedArea,dependencies:s.dependencies,evidence:{findingIds:s.evidenceFindingIds},risk:s.risk,estimatedEffortMinutes:s.estimatedEffortMinutes,verificationMethod:s.verificationMethod,rollbackAction:s.rollbackAction,requiresApproval:s.requiresApproval,findings:{create:s.evidenceFindingIds.map(findingId=>({findingId}))}}))}} ,include:{steps:{include:{findings:true},orderBy:{order:"asc"}}}});
 return plan;
}
export async function listRepairPlans(userId:string){return getPrisma().repairPlan.findMany({where:{userId},orderBy:{createdAt:"desc"},include:{diagnosisRun:{include:{target:true}},steps:{orderBy:{order:"asc"},include:{findings:true}}})}
export async function getRepairPlan(userId:string,id:string){return getPrisma().repairPlan.findFirst({where:{id,userId},include:{diagnosisRun:{include:{target:true}},steps:{orderBy:{order:"asc"},include:{findings:true}}})}
export async function reviewRepairPlan(userId:string,id:string,decision:"APPROVED"|"REJECTED"){
 const prisma=getPrisma();const plan=await prisma.repairPlan.findFirst({where:{id,userId}});
 if(!plan)throw new Error("Repair plan not found.");
 if(plan.status!=="READY_FOR_REVIEW"&&plan.status!=="DRAFT")throw new Error("Repair plan cannot be reviewed in its current state.");
 if(decision==="APPROVED"&&!plan.requiresApproval)throw new Error("Repair plan does not require approval.");
 return prisma.repairPlan.update({where:{id:plan.id},data:{status:decision==="APPROVED"?"APPROVED":"REJECTED",approvalStatus:decision,approvedAt:decision==="APPROVED"?new Date():null,approvedBy:decision==="APPROVED"?userId:null}});
}
