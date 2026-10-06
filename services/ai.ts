import "server-only";

import { opportunities } from "@/lib/mock-data";
import { OpenAIProvider } from "@/services/openai-provider";

export type Analysis={opportunity:string;confidence:number;whyItMatters:string;nextSteps:string[]};
export type SolverResult={summary:string;steps:string[];risks:string[]};
export interface AnalysisProvider{analyze(itemId:string):Promise<Analysis>}
export interface SolverProvider{solve(problem:string):Promise<SolverResult>}
export type AIProviderName="mock"|"openai";

export class MockAnalysisProvider implements AnalysisProvider{
 async analyze(itemId:string):Promise<Analysis>{const item=opportunities.find(x=>x.id===itemId);if(!item)throw new Error("Opportunity not found");return {opportunity:item.title,confidence:88,whyItMatters:"The signal suggests a meaningful workflow problem with a clear user group. Validate frequency, willingness to pay, and existing alternatives before building.",nextSteps:["Interview 3–5 target users","Measure how often the problem occurs","Map current alternatives and switching costs"]};}
}
export class MockSolverProvider implements SolverProvider{
 async solve(problem:string):Promise<SolverResult>{return {summary:"Start by narrowing the problem to one measurable outcome. The submitted problem is: "+problem.slice(0,180)+(problem.length>180?"…":""),steps:["Define the user and desired outcome","Document the current workflow and its biggest bottleneck","Test the smallest practical intervention","Measure results before expanding scope"],risks:["The stated problem may be a symptom rather than the root cause","Existing tools may solve part of the problem","A technical solution may not have enough economic value"]};}
}
export function getConfiguredProviderName(env:NodeJS.ProcessEnv=process.env):AIProviderName{return env.AI_PROVIDER?.trim().toLowerCase()==="openai"?"openai":"mock"}

export function createProviders(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch):{analysis:AnalysisProvider;solver:SolverProvider}{
 const mock={analysis:new MockAnalysisProvider(),solver:new MockSolverProvider()};
 if(getConfiguredProviderName(env)!=="openai")return mock;
 const apiKey=env.OPENAI_API_KEY?.trim();
 if(!apiKey){console.warn("AI provider configured as openai but OPENAI_API_KEY is missing; using mock provider.");return mock;}
 const openai=new OpenAIProvider(apiKey,env.OPENAI_MODEL?.trim(),fetcher);
 return {analysis:new FallbackAnalysisProvider(openai,mock.analysis),solver:new FallbackSolverProvider(openai,mock.solver)};
}
class FallbackAnalysisProvider implements AnalysisProvider{constructor(private readonly primary:AnalysisProvider,private readonly fallback:AnalysisProvider){}async analyze(itemId:string){try{return await this.primary.analyze(itemId)}catch{console.warn("AI analysis provider failed; using mock fallback.");return this.fallback.analyze(itemId)}}}
class FallbackSolverProvider implements SolverProvider{constructor(private readonly primary:SolverProvider,private readonly fallback:SolverProvider){}async solve(problem:string){try{return await this.primary.solve(problem)}catch{console.warn("AI solver provider failed; using mock fallback.");return this.fallback.solve(problem)}}}
export async function analyzeOpportunity(itemId:string):Promise<Analysis>{if(!opportunities.some(x=>x.id===itemId))throw new Error("Opportunity not found");return createProviders().analysis.analyze(itemId)}
export async function solveProblem(problem:string):Promise<SolverResult>{return createProviders().solver.solve(problem)}
