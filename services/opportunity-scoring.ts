import type { OpportunityDraft } from "@/services/opportunity-domain";
export type OpportunityDimension="problemSeverity"|"demandPotential"|"marketPotential"|"competitionPosition"|"technicalFeasibility"|"monetizationPotential"|"executionRisk";
export const SCORE_WEIGHTS:Record<OpportunityDimension,number>={problemSeverity:.18,demandPotential:.17,marketPotential:.16,competitionPosition:.10,technicalFeasibility:.14,monetizationPotential:.15,executionRisk:.10};
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
function demandScore(d:OpportunityDraft){return clamp(d.demandSignals.filter(x=>x.source==="user_fact").length*25+d.demandSignals.filter(x=>x.source==="ai_hypothesis").length*10);}
function marketScore(d:OpportunityDraft){return clamp(d.businessPotential*.7+(d.targetUsers.length>=2?15:0)+(d.monetizationPossibilities.length>=2?15:0));}
function competitionScore(d:OpportunityDraft){const known=d.existingAlternatives.filter(x=>x.source!=="unknown").length;return clamp(75-known*15);}
function riskScore(d:OpportunityDraft){return clamp(100-d.estimatedDifficulty*.6-d.risks.length*4);}
export function scoreOpportunity(draft:OpportunityDraft){
 const dimensionScores={problemSeverity:clamp(draft.painSeverity),demandPotential:demandScore(draft),marketPotential:marketScore(draft),competitionPosition:competitionScore(draft),technicalFeasibility:clamp(draft.technicalFeasibility),monetizationPotential:clamp(draft.monetizationPossibilities.length*18+draft.businessPotential*.55),executionRisk:riskScore(draft)};
 const dimensionExplanations={problemSeverity:"Pain severity is "+dimensionScores.problemSeverity+"/100 based on the submitted problem assessment.",demandPotential:"Demand evidence scores "+dimensionScores.demandPotential+"/100; user-provided facts receive more weight than AI hypotheses.",marketPotential:"Market potential is "+dimensionScores.marketPotential+"/100 using business potential plus breadth of target users and monetization paths.",competitionPosition:"Competition position is "+dimensionScores.competitionPosition+"/100 and is reduced when known alternatives are identified.",technicalFeasibility:"Technical feasibility is "+dimensionScores.technicalFeasibility+"/100 from the structured assessment.",monetizationPotential:"Monetization potential is "+dimensionScores.monetizationPotential+"/100 from business potential and plausible paths.",executionRisk:"Execution-risk score is "+dimensionScores.executionRisk+"/100; higher difficulty and more risks reduce it."};
 const overallScore=clamp(Object.entries(SCORE_WEIGHTS).reduce((sum,[key,weight])=>sum+dimensionScores[key as OpportunityDimension]*weight,0));
 const evidenceCount=draft.userProvidedFacts.length+draft.demandSignals.filter(x=>x.source==="user_fact").length;
 const unknownPenalty=Math.min(30,draft.unknowns.length*3);
 const confidence=clamp(35+Math.min(30,evidenceCount*10)+Math.min(20,draft.aiHypotheses.length*4)-unknownPenalty);
 return {dimensionScores,dimensionExplanations,overallScore,confidence};
}
