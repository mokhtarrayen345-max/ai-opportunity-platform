import { z } from "zod";

export const validationStatuses = ["UNVALIDATED","WEAK","SUPPORTED","STRONG","HIGH_CONFIDENCE"] as const;
export type ValidationStatus = typeof validationStatuses[number];
export const evidenceQualityResultSchema=z.object({qualityScore:z.number().int().min(0).max(100),validationStatus:z.enum(validationStatuses),confidence:z.number().int().min(0).max(100),reasons:z.array(z.string().min(1)),supportingEvidenceCount:z.number().int().min(0),distinctSourceCount:z.number().int().min(0),recentEvidenceCount:z.number().int().min(0),duplicateCount:z.number().int().min(0),facts:z.array(z.string()),hypotheses:z.array(z.string()),assumptions:z.array(z.string()),unknowns:z.array(z.string())});
export type EvidenceQualityResult=z.infer<typeof evidenceQualityResultSchema>;
export type ValidationEvidence={title:string;summary:string;observedAt:Date|string;sourceType:string;sourceId?:string|null;fingerprint:string;evidenceConfidence:number;severity:number;urgency:number};
const sourceReliability:Record<string,number>={github:85,api:75,news:70,web:65,social:55,other:50,mock:50};
function reliability(type:string){return sourceReliability[type.trim().toLowerCase()]??50}
function recencyScore(date:Date,now=Date.now()){const days=Math.max(0,(now-date.getTime())/86400000);return Math.max(0,Math.round(100*Math.exp(-days/90)))}
function tokens(value:string){return new Set(value.toLowerCase().replace(/[^a-z0-9\s]+/g," ").split(/\s+/).filter(x=>x.length>2))}
function specificity(e:ValidationEvidence[]){return e.length?Math.round(e.reduce((s,x)=>s+Math.max(0,Math.min(100,x.evidenceConfidence)),0)/e.length):0}
function consistency(e:ValidationEvidence[]){if(e.length<2)return e.length?70:0;const sets=e.map(x=>tokens(x.title+" "+x.summary));let pairs=0,total=0;for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){let common=0;for(const t of sets[i])if(sets[j].has(t))common++;const union=new Set([...sets[i],...sets[j]]).size;pairs+=union?Math.round(common/union*100):0;total++}return total?Math.max(0,Math.min(100,Math.round(pairs/total*2.5))):0}

export function evaluateEvidenceQuality(evidence:ValidationEvidence[],problemStatement:string,now=new Date()):EvidenceQualityResult{
 const byFingerprint=new Map<string,ValidationEvidence>();let duplicateCount=0;
 for(const item of evidence){const key=item.fingerprint.trim()||[item.sourceId??"",item.title,item.observedAt].join("|");if(byFingerprint.has(key)){duplicateCount++;continue}byFingerprint.set(key,item)}
 const unique=[...byFingerprint.values()];
 if(!unique.length)return evidenceQualityResultSchema.parse({qualityScore:0,validationStatus:"UNVALIDATED",confidence:0,reasons:["No supporting evidence is currently available."],supportingEvidenceCount:0,distinctSourceCount:0,recentEvidenceCount:0,duplicateCount,facts:[],hypotheses:[],assumptions:["The problem cannot be validated without source evidence."],unknowns:["Whether the problem is real, recurring, urgent, or broadly affected."]});
 const distinctSources=new Set(unique.map(x=>(x.sourceId||x.sourceType).toLowerCase())).size;
 const recent=unique.filter(x=>recencyScore(new Date(x.observedAt),now.getTime())>=50).length;
 const sourceReliabilityScore=Math.round(unique.reduce((s,x)=>s+reliability(x.sourceType),0)/unique.length);
 const diversityScore=Math.min(100,distinctSources*25),countScore=Math.min(100,unique.length*12.5);
 const recency=unique.length?Math.round(unique.reduce((s,x)=>s+recencyScore(new Date(x.observedAt),now.getTime()),0)/unique.length):0;
 const spec=specificity(unique),consistencyScore=consistency(unique),severity=Math.round(unique.reduce((s,x)=>s+x.severity,0)/unique.length),urgency=Math.round(unique.reduce((s,x)=>s+x.urgency,0)/unique.length);
 const problemTokens=tokens(problemStatement);
 const aligned=unique.filter(x=>{const t=tokens(x.title+" "+x.summary);let common=0;for(const k of problemTokens)if(t.has(k))common++;return problemTokens.size>0&&common>0}).length;
 const specificityAdjusted=Math.round((spec+Math.min(100,Math.round(aligned/unique.length*100)))/2);
 const raw=Math.round(sourceReliabilityScore*.15+diversityScore*.15+countScore*.15+recency*.12+specificityAdjusted*.18+consistencyScore*.10+severity*.07+urgency*.04);
 const quality=Math.max(0,Math.min(100,raw-Math.min(20,duplicateCount*10)));
 const status:ValidationStatus=quality>=90&&unique.length>=5&&distinctSources>=3?"HIGH_CONFIDENCE":quality>=75&&unique.length>=3&&distinctSources>=2?"STRONG":quality>=55&&unique.length>=2?"SUPPORTED":quality>0?"WEAK":"UNVALIDATED";
 const confidence=Math.max(0,Math.min(100,Math.round((quality+specificityAdjusted)/2)));
 const reasons=["+ "+unique.length+" independent evidence item(s)","+ "+distinctSources+" distinct source class(es)",recent?"+ "+recent+" recent evidence item(s)":"- limited recent evidence",specificityAdjusted>=70?"+ specific and well-supported problem details":"- limited problem specificity",consistencyScore>=70?"+ evidence shows consistent symptoms":"- evidence consistency is limited",sourceReliabilityScore>=75?"+ source reliability indicators are favorable":"- source reliability is conservative",duplicateCount?"- "+duplicateCount+" duplicate item(s) excluded from confidence":""].filter(Boolean);
 const facts=unique.slice(0,10).map(x=>"Source evidence: "+x.title+" — "+x.summary);
 const hypotheses:string[]=[];if(unique.length>=2&&consistencyScore>=60)hypotheses.push("The evidence may represent a recurring underlying problem; recurrence remains a hypothesis until independently confirmed.");
 const assumptions:string[]=[];if(unique.some(x=>!x.sourceId))assumptions.push("Evidence without a source identifier is treated as belonging to its declared source class only.");
 const unknowns:string[]=[];if(distinctSources<2)unknowns.push("Cross-source confirmation is not established.");unknowns.push("Business impact and willingness to pay are not established by evidence quality alone.");
 return evidenceQualityResultSchema.parse({qualityScore:quality,validationStatus:status,confidence,reasons,supportingEvidenceCount:unique.length,distinctSourceCount:distinctSources,recentEvidenceCount:recent,duplicateCount,facts,hypotheses,assumptions,unknowns});
}