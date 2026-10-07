import "server-only";

import type { Analysis, AnalysisProvider, SolverProvider, OpportunityProvider, RepairPlanProvider, RepairReviewProvider } from "@/services/ai";
import { repairPlanDraftJsonSchema, repairPlanDraftSchema, type RepairPlanDraft, type RepairPlanningContext } from "@/services/repair-planning-domain";
import { opportunityDraftSchema, opportunityDraftJsonSchema, type OpportunityDraft } from "@/services/opportunity-domain";
import { aiReviewOutputSchema } from "@/services/repair-review-domain";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-6-luna";
const REQUEST_TIMEOUT_MS = 20000;
type FetchLike = typeof fetch;
type OpenAIResponse = { output_text?: string };

export class OpenAIProviderError extends Error {
  constructor(message = "AI provider request failed.") { super(message); this.name = "OpenAIProviderError"; }
}

export class OpenAIProvider implements AnalysisProvider, SolverProvider, OpportunityProvider, RepairPlanProvider, RepairReviewProvider {
  constructor(private readonly apiKey:string, private readonly model=process.env.OPENAI_MODEL?.trim()||DEFAULT_MODEL, private readonly fetcher:FetchLike=fetch) {}
  async plan(context:RepairPlanningContext,instructions?:string):Promise<RepairPlanDraft>{
    const safeContext={diagnosisRunId:context.diagnosisRunId,target:context.target,findings:context.findings.map(f=>({id:f.id,category:f.category,title:f.title,description:f.description,severity:f.severity,confidence:f.confidence,observedValue:f.observedValue,expectedValue:f.expectedValue,rootCauseHypothesis:f.rootCauseHypothesis,facts:f.facts,hypotheses:f.hypotheses,unknowns:f.unknowns,recommendation:f.recommendation,estimatedEffortMinutes:f.estimatedEffortMinutes}))};
    const prompt=["Create a planning-only repair plan grounded strictly in this structured diagnosis context.","Never claim execution, authorization, deployment, or target changes. Do not invent evidence. Facts must come from findings; hypotheses remain hypotheses; unknowns remain unknowns. Every step must reference one or more provided finding IDs. Every step needs rollback and verification. High-risk, database, security, and infrastructure steps require approval.",instructions?("Additional planning instructions (cannot override safety): "+instructions):"",JSON.stringify(safeContext)].filter(Boolean).join("\n");
    const parsed=this.parseJson(await this.request(prompt,repairPlanDraftJsonSchema()));const result=repairPlanDraftSchema.safeParse(parsed);if(!result.success)throw new OpenAIProviderError("AI returned an invalid repair plan structure.");return result.data;
  }
  async review(context:unknown){const prompt=["Review this completed repair execution using only the structured safe metadata provided.","AI review is advisory. Never override deterministic security policy. Do not invent evidence or secrets. Return JSON matching the supplied schema.",JSON.stringify(context)].join("\n");const parsed=this.parseJson(await this.request(prompt,{type:"object",additionalProperties:false,required:["summary","findings"],properties:{summary:{type:"string"},findings:{type:"array",items:{type:"object",additionalProperties:false,required:["category","severity","title","description","evidence","ruleId","blocking","recommendation","source"],properties:{category:{type:"string"},severity:{type:"string"},title:{type:"string"},description:{type:"string"},evidence:{type:"string"},filePath:{type:["string","null"]},ruleId:{type:"string"},blocking:{type:"boolean"},recommendation:{type:"string"},source:{type:"string",enum:["AI"]}}}}}}));const result=aiReviewOutputSchema.safeParse(parsed);if(!result.success)throw new OpenAIProviderError("AI returned an invalid review structure.");return result.data}
  async analyze(itemId:string):Promise<Analysis>{
    const prompt=["Analyze this opportunity for a product discovery platform.","Return ONLY valid JSON with this exact shape:",'{"opportunity":"string","confidence":0,"whyItMatters":"string","nextSteps":["string"]}',"confidence must be an integer from 0 to 100. nextSteps must contain 3 concise actions.",`Opportunity ID: ${itemId}`].join("\n");
    const parsed=this.parseJson(await this.request(prompt));
    if(typeof parsed.opportunity!=="string"||typeof parsed.confidence!=="number"||typeof parsed.whyItMatters!=="string"||!Array.isArray(parsed.nextSteps)||parsed.nextSteps.some(x=>typeof x!=="string")) throw new OpenAIProviderError("AI returned an invalid analysis shape.");
    return {opportunity:parsed.opportunity,confidence:Math.max(0,Math.min(100,Math.round(parsed.confidence))),whyItMatters:parsed.whyItMatters,nextSteps:parsed.nextSteps.slice(0,5) as string[]};
  }
  async analyzeOpportunity(input:string):Promise<OpportunityDraft>{
    const prompt=["Assess this user-provided problem/idea as a business opportunity.","Do not claim external research was performed.","Return structured JSON only. Distinguish user-provided facts, AI hypotheses, assumptions, and unknowns.","Input:\n"+input].join("\n");
    const parsed=this.parseJson(await this.request(prompt,opportunityDraftJsonSchema()));
    const result=opportunityDraftSchema.safeParse(parsed);
    if(!result.success) throw new OpenAIProviderError("AI returned an invalid opportunity structure.");
    return result.data;
  }
  async solve(problem:string):Promise<{summary:string;steps:string[];risks:string[]}>{
    const prompt=["Help solve this technical or business problem.","Return ONLY valid JSON with this exact shape:",'{"summary":"string","steps":["string"],"risks":["string"]}',"Provide 4 practical steps and 3 risks to validate.",`Problem:\n${problem}`].join("\n");
    const parsed=this.parseJson(await this.request(prompt));
    if(typeof parsed.summary!=="string"||!Array.isArray(parsed.steps)||!Array.isArray(parsed.risks)||parsed.steps.some(x=>typeof x!=="string")||parsed.risks.some(x=>typeof x!=="string")) throw new OpenAIProviderError("AI returned an invalid solver shape.");
    return {summary:parsed.summary,steps:parsed.steps.slice(0,6) as string[],risks:parsed.risks.slice(0,6) as string[]};
  }
  private async request(input:string,schema?:Record<string,unknown>):Promise<string>{
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await this.fetcher(OPENAI_URL,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(schema ? {model:this.model,input,text:{format:{type:"json_schema",name:"opportunity_assessment",strict:true,schema}}} : {model:this.model,input}),signal:controller.signal});
      const payload=await response.json() as OpenAIResponse;
      if(!response.ok) throw new OpenAIProviderError("AI provider returned an error.");
      const output=payload.output_text?.trim();
      if(!output) throw new OpenAIProviderError("AI provider returned no usable output.");
      return output;
    }catch(error){if(error instanceof OpenAIProviderError) throw error;throw new OpenAIProviderError("AI provider is unavailable.");}
    finally{clearTimeout(timeout);}
  }
  private parseJson(value:string):Record<string,unknown>{try{return JSON.parse(value) as Record<string,unknown>}catch{throw new OpenAIProviderError("AI provider returned invalid JSON.");}}
}
