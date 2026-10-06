import "server-only";
import {rawSourceItemSchema,type RawSourceItem,intelligenceSignalSchema} from "@/services/intelligence-domain";
import {fingerprintSourceItem} from "@/services/intelligence-fingerprint";
import {DeterministicSignalClassifier,type SignalClassifier} from "@/services/intelligence-classifier";
import {findSignalByFingerprint,saveIntelligenceSignal} from "@/services/intelligence-persistence";
export type ProcessResult={status:"saved"|"duplicate"|"rejected";signalId?:string;error?:string};
export async function processSourceItem(userId:string,raw:unknown,classifier:SignalClassifier=new DeterministicSignalClassifier()):Promise<ProcessResult>{
  try{
    const parsed=rawSourceItemSchema.safeParse(raw); if(!parsed.success)return {status:"rejected",error:"Invalid source item."};
    const fingerprint=fingerprintSourceItem(parsed.data); const existing=await findSignalByFingerprint(userId,fingerprint); if(existing)return {status:"duplicate",signalId:existing.id};
    const normalized=await Promise.resolve(require("./intelligence-domain").normalizeRawSourceItem(parsed.data));
    const classified=classifier.classify(normalized);
    const record=intelligenceSignalSchema.parse({id:"pending",...normalized,signalType:classified.signalType,confidence:classified.confidence,aiInterpretation:classified.aiInterpretation,assumptions:classified.assumptions,unknowns:classified.unknowns,fingerprint,opportunityAnalysisStatus:"not_analyzed",createdAt:new Date().toISOString()});
    const saved=await saveIntelligenceSignal(userId,{title:record.title,summary:record.summary,sourceType:record.sourceType,sourceName:record.sourceName,sourceUrl:record.sourceUrl,externalId:record.externalId,detectedAt:new Date(record.detectedAt),receivedAt:new Date(record.receivedAt),topic:record.topic,entities:record.entities,signalType:record.signalType,rawContent:record.rawContent,rawReference:record.rawReference,normalizedContent:record.normalizedContent,sourceFacts:record.sourceFacts,aiInterpretation:record.aiInterpretation,assumptions:record.assumptions,unknowns:record.unknowns,confidence:record.confidence,metadata:record.metadata,fingerprint});
    return {status:"saved",signalId:saved.id};
  }catch(error){console.error("intelligence_process_error",error);return {status:"rejected",error:"Unable to process source item."};}
}
export async function processProvider(userId:string,provider:{discover():Promise<RawSourceItem[]>}){const results:ProcessResult[]=[];for(const item of await provider.discover())results.push(await processSourceItem(userId,item));return results;}
