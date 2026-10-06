import "server-only";
import {findSignalById,markSignalAnalyzed} from "@/services/intelligence-persistence";
import {assessOpportunity} from "@/services/opportunity-engine";
export async function analyzeSignalForOpportunity(userId:string,signalId:string){
  const signal=await findSignalById(userId,signalId); if(!signal)throw new Error("Signal not found.");
  const input=[signal.title,signal.summary,signal.normalizedContent,"Source facts: "+JSON.stringify(signal.sourceFacts),"Unknowns: "+JSON.stringify(signal.unknowns)].join("\n\n");
  const assessment=await assessOpportunity(input,{persist:true,userId});
  await markSignalAnalyzed(userId,signalId);
  return assessment;
}
