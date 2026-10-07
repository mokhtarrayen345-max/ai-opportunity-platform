import "server-only";
import { getPrisma } from "@/lib/db";
import { evaluateEvidenceQuality, type EvidenceQualityResult } from "@/services/intelligence-validation-domain";

export async function validateProblemEvidence(userId:string,problemId:string):Promise<EvidenceQualityResult>{
 const prisma=getPrisma();
 const problem=await prisma.discoveredProblem.findFirst({where:{id:problemId,userId},include:{evidence:true}});
 if(!problem)throw new Error("Problem not found.");
 return evaluateEvidenceQuality(problem.evidence.map(e=>({title:e.title,summary:e.summary,observedAt:e.observedAt,sourceType:e.sourceType,sourceId:e.sourceId,fingerprint:e.fingerprint,evidenceConfidence:e.evidenceConfidence,severity:e.severity,urgency:e.urgency})),problem.normalizedProblemStatement);
}
export async function validateAllUserProblems(userId:string){const problems=await getPrisma().discoveredProblem.findMany({where:{userId},select:{id:true,normalizedProblemStatement:true,evidence:{select:{title:true,summary:true,observedAt:true,sourceType:true,sourceId:true,fingerprint:true,evidenceConfidence:true,severity:true,urgency:true}}}});return problems.map(p=>({problemId:p.id,validation:evaluateEvidenceQuality(p.evidence,p.normalizedProblemStatement)}));}
