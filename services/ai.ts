import { opportunities } from "@/lib/mock-data";
export type Analysis={opportunity:string;confidence:number;whyItMatters:string;nextSteps:string[]};
export interface AnalysisProvider{analyze(itemId:string):Promise<Analysis>}
export interface SolverProvider{solve(problem:string):Promise<{summary:string;steps:string[];risks:string[]}>}
class MockAnalysisProvider implements AnalysisProvider{async analyze(itemId:string){const item=opportunities.find(x=>x.id===itemId);if(!item)throw new Error("Opportunity not found");return {opportunity:item.title,confidence:88,whyItMatters:"The signal suggests a meaningful workflow problem with a clear user group. Validate frequency, willingness to pay, and existing alternatives before building.",nextSteps:["Interview 3–5 target users","Measure how often the problem occurs","Map current alternatives and switching costs"]};}}
class MockSolverProvider implements SolverProvider{async solve(problem:string){return {summary:"Start by narrowing the problem to one measurable outcome. The submitted problem is: "+problem.slice(0,180)+(problem.length>180?"…":""),steps:["Define the user and desired outcome","Document the current workflow and its biggest bottleneck","Test the smallest practical intervention","Measure results before expanding scope"],risks:["The stated problem may be a symptom rather than the root cause","Existing tools may solve part of the problem","A technical solution may not have enough economic value"]};}}
const analysisProvider:AnalysisProvider=new MockAnalysisProvider();
const solverProvider:SolverProvider=new MockSolverProvider();
export const analyzeOpportunity=(itemId:string)=>analysisProvider.analyze(itemId);
export const solveProblem=(problem:string)=>solverProvider.solve(problem);