import "server-only";
import {createProviders} from "@/services/ai";
import {getPrisma} from "@/lib/db";
import {extractUserFacts,opportunityAssessmentSchema,type OpportunityAssessment} from "@/services/opportunity-domain";
import {scoreOpportunity} from "@/services/opportunity-scoring";
export async function assessOpportunity(input:string,options:{persist?:boolean;userId?:string}={}):Promise<OpportunityAssessment>{
 const clean=input.trim();const draft=await createProviders().opportunity.analyzeOpportunity(clean);
 const scored=scoreOpportunity({...draft,userProvidedFacts:draft.userProvidedFacts.length?draft.userProvidedFacts:extractUserFacts(clean)});
 const assessment=opportunityAssessmentSchema.parse({...draft,...scored,createdAt:new Date().toISOString()});
 if(options.persist&&options.userId)await saveOpportunity(options.userId,clean,assessment);
 return assessment;
}
async function saveOpportunity(userId:string,input:string,assessment:OpportunityAssessment){return getPrisma().opportunityRecord.create({data:{userId,input,title:assessment.title,shortSummary:assessment.shortSummary,problemStatement:assessment.problemStatement,targetUsers:assessment.targetUsers,marketDomain:assessment.marketDomain,painSeverity:assessment.painSeverity,demandSignals:assessment.demandSignals,existingAlternatives:assessment.existingAlternatives,proposedSolutionDirection:assessment.proposedSolutionDirection,monetizationPossibilities:assessment.monetizationPossibilities,estimatedDifficulty:assessment.estimatedDifficulty,technicalFeasibility:assessment.technicalFeasibility,businessPotential:assessment.businessPotential,risks:assessment.risks,assumptions:assessment.assumptions,unknowns:assessment.unknowns,recommendedNextStep:assessment.recommendedNextStep,dimensionScores:assessment.dimensionScores,dimensionExplanations:assessment.dimensionExplanations,overallScore:assessment.overallScore,confidence:assessment.confidence}});}
export async function getUserOpportunityHistory(userId:string){return getPrisma().opportunityRecord.findMany({where:{userId},orderBy:{createdAt:"desc"},take:50});}
