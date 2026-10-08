import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { transitionExecution } from "@/services/repair-execution-state-machine";
import { GitHubRepositoryProvider } from "@/services/github-repository-provider";
import { scanSecretContent } from "@/services/repair-secret-scanner";
import { validateCommand } from "@/services/repair-execution-domain";
const resultSchema=z.object({status:z.enum(["DISABLED","UNAUTHORIZED","NOT_CONFIGURED","REJECTED","FAILED","SUCCEEDED"]),executionId:z.string().nullable(),message:z.string()});
export type ControlledVerificationResult=z.infer<typeof resultSchema>;
const enabled=()=>process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED==="true";
const configuredRepo=()=>process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY?.trim()||null;
const repoAllowed=(repo:string)=>new Set((process.env.GITHUB_ALLOWED_REPOSITORIES||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)).has(repo.toLowerCase());
export function controlledVerificationConfig(){return{enabled:enabled(),repository:configuredRepo()};}
export function verificationBranch(executionId:string){const branch="github-verification/"+executionId;return /^github-verification\/[A-Za-z0-9_-]+$/.test(branch)?branch:null;}
export function verifyClientPayload(body:unknown){return z.object({}).strict().safeParse(body).success;}
export async function runControlledVerification(userId:string,provider?:Pick<GitHubRepositoryProvider,"validateAuthorizedRepository">):Promise<ControlledVerificationResult>{
if(!enabled())return{status:"DISABLED",executionId:null,message:"Controlled GitHub verification is disabled."};
const target=configuredRepo();if(!target)return{status:"NOT_CONFIGURED",executionId:null,message:"Controlled verification repository is not configured."};
if(!repoAllowed(target))return{status:"REJECTED",executionId:null,message:"Controlled verification repository is not allowlisted."};
const p=getPrisma();const repo=await p.authorizedRepository.findFirst({where:{userId,provider:"GITHUB",status:"ACTIVE",authorizationStatus:"AUTHORIZED",repositoryIdentifier:target},orderBy:{createdAt:"desc"}});
if(!repo)return{status:"UNAUTHORIZED",executionId:null,message:"No active authorized GitHub installation matches the configured verification repository."};
const plan=await p.repairPlan.findFirst({where:{userId},orderBy:{createdAt:"desc"}});if(!plan)return{status:"FAILED",executionId:null,message:"Controlled verification requires an existing repair plan."};
const execution=await p.repairExecution.create({data:{userId,repairPlanId:plan.id,authorizedRepositoryId:repo.id}});const id=execution.id;
try{await transitionExecution(p,id,"AUTHORIZED",{authorizationStatus:"AUTHORIZED",authorizedAt:new Date(),authorizedBy:userId});
const meta=await(provider||new GitHubRepositoryProvider()).validateAuthorizedRepository(repo);if(["main","master","production","prod"].includes(meta.defaultBranch.toLowerCase()))throw new Error("Verification repository has an unsafe protected default branch.");
const branch=verificationBranch(id);if(!branch)throw new Error("Unable to generate a safe verification branch.");
const marker="Controlled verification "+createHash("sha256").update(id).digest("hex").slice(0,16);if(!scanSecretContent(marker).safe)throw new Error("Verification marker failed secret scanning.");
validateCommand({name:"npm test",args:[]});await transitionExecution(p,id,"RUNNING",{workspaceId:"controlled-verification",branchName:branch,startedAt:new Date(),error:null});
if(process.env.NODE_ENV==="test"||process.env.GITHUB_CONTROLLED_VERIFICATION_MOCK==="true"){await transitionExecution(p,id,"TESTING");await transitionExecution(p,id,"SUCCEEDED",{completedAt:new Date(),summary:"Mock controlled verification passed; no GitHub write was performed."});return{status:"SUCCEEDED",executionId:id,message:"Mock controlled verification succeeded; no GitHub write was performed."};}
if(process.env.GITHUB_REPAIR_EXECUTION_ENABLED==="true")throw new Error("General GitHub repair execution must remain disabled during controlled verification.");
throw new Error("Real controlled verification requires the separately configured verification runner.");
}catch(e){try{await transitionExecution(p,id,"FAILED",{completedAt:new Date(),error:"Controlled verification failed; diagnostics remain server-side."})}catch{};return{status:"FAILED",executionId:id,message:e instanceof Error&&e.message.includes("GitHub")?e.message:"Controlled verification failed safely."};}}