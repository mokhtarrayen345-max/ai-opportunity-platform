import "server-only";
import type { Analysis, SolverResult } from "@/services/ai";
import { getPrisma } from "@/lib/db";

export async function saveAnalysis(userId:string,itemId:string,result:Analysis){
 return getPrisma().analysisRecord.create({data:{userId,itemId,opportunity:result.opportunity,confidence:result.confidence,whyItMatters:result.whyItMatters,nextSteps:result.nextSteps}});
}
export async function saveSolverResult(userId:string,problem:string,result:SolverResult){
 return getPrisma().solverRecord.create({data:{userId,problem,summary:result.summary,steps:result.steps,risks:result.risks}});
}
export async function getUserHistory(userId:string){
 const db=getPrisma();
 return {analyses:await db.analysisRecord.findMany({where:{userId},orderBy:{createdAt:"desc"},take:50}),solvers:await db.solverRecord.findMany({where:{userId},orderBy:{createdAt:"desc"},take:50})};
}
