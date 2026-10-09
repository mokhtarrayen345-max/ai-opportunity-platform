import "server-only";
import { mkdtemp, chmod, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { safeWorkspacePath } from "@/services/repair-execution-domain";
import { assertWorkspaceRoot, assertWorkspacePath } from "@/services/repair-workspace";
import { createInstallationToken, isGitHubAppConfigured } from "@/services/github-app-client";

const API="https://api.github.com";
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const protectedBranches=new Set(["main","master","production","prod"]);
const safeBranch=/^repair\/[A-Za-z0-9_-]+$/;

export type GitHubRepositoryMetadata={owner:string;name:string;fullName:string;defaultBranch:string;private:boolean;repositoryId:string};
type AuthorizedRepo={repositoryIdentifier:string;repositoryOwner?:string|null;repositoryName?:string|null;githubRepositoryId?:string|null;installationId?:string|null;authorizationStatus:string;status:string};

function parseIdentifier(identifier:string){
  if(!repoPattern.test(identifier))throw new Error("Invalid GitHub repository identifier.");
  const [owner,name]=identifier.split("/");if(!owner||!name)throw new Error("Invalid GitHub repository identifier.");
  return {owner,name,fullName:identifier};
}
function assertAllowed(fullName:string){
  const allowed=new Set((process.env.GITHUB_ALLOWED_REPOSITORIES||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
  if(!allowed.has(fullName.toLowerCase()))throw new Error("GitHub repository is not authorized for this application.");
}
async function githubFetch(path:string,token:string,init:RequestInit={}){
  const url=new URL(path,API);if(url.origin!==API)throw new Error("GitHub request scope violation.");
  const res=await fetch(url,{...init,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10",Authorization:"Bearer "+token,...init.headers},signal:AbortSignal.timeout(10000)});
  if(!res.ok){if(res.status===401||res.status===403)throw new Error("GitHub authorization failed.");if(res.status===404)throw new Error("GitHub repository not found.");if(res.status===409)throw new Error("GitHub repository branch conflict.");if(res.status===429)throw new Error("GitHub rate limit reached.");throw new Error("GitHub provider request failed.");}
  return res;
}
function runProcess(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,timeoutMs=120000){
  const allowed=new Set(["git","npm","npx"]);if(!allowed.has(command))throw new Error("Command is not allowlisted.");
  if(args.some(a=>/[\0\r\n]/.test(a)))throw new Error("Unsafe command argument.");
  const executable=process.platform==="win32"&&command==="npm"?"npm.cmd":process.platform==="win32"&&command==="npx"?"npx.cmd":command;
  return new Promise<{stdout:string;stderr:string;code:number;startedAt:Date}>((resolve,reject)=>{
    const startedAt=new Date();const child=spawn(executable,args,{cwd,env,shell:false,windowsHide:true});
    let stdout="",stderr="";const timer=setTimeout(()=>{child.kill("SIGTERM");reject(new Error("Command timed out."));},timeoutMs);
    child.stdout.on("data",d=>{stdout+=String(d).slice(0,120000)});child.stderr.on("data",d=>{stderr+=String(d).slice(0,20000)});
    child.on("error",()=>{clearTimeout(timer);reject(new Error("Command execution failed."))});
    child.on("close",code=>{clearTimeout(timer);resolve({stdout,stderr,code:code??1,startedAt})});
  });
}
async function withAskPass<T>(token:string,fn:(env:NodeJS.ProcessEnv)=>Promise<T>){
  const dir=await mkdtemp(join(tmpdir(),"aop-git-auth-"));const script=join(dir,process.platform==="win32"?"askpass.cmd":"askpass.sh");
  const content=process.platform==="win32"?"@echo off\r\nset \"PROMPT=%~1\"\r\nif /I not \"%PROMPT:Username=%\"==\"%PROMPT%\" (echo x-access-token) else (echo %AOP_GIT_TOKEN%)\r\n":"#!/bin/sh\ncase \"$1\" in *Username*) printf '%s\\n' \"x-access-token\" ;; *) printf '%s\\n' \"$AOP_GIT_TOKEN\" ;; esac\n";
  await writeFile(script,content,{encoding:"utf8",mode:0o700});if(process.platform!=="win32")await chmod(script,0o700);
  try{return await fn({...process.env,GIT_ASKPASS:script,GIT_TERMINAL_PROMPT:"0",AOP_GIT_TOKEN:token})}
  finally{await rm(dir,{recursive:true,force:true}).catch(()=>{})}
}
export class GitHubRepositoryProvider{
  async validateAuthorizedRepository(repo:AuthorizedRepo,allowEmptyRepository=false):Promise<GitHubRepositoryMetadata>{
    if(repo.status!=="ACTIVE"||repo.authorizationStatus!=="AUTHORIZED")throw new Error("GitHub repository authorization is not active.");
    if(!repo.installationId||!repo.githubRepositoryId)throw new Error("GitHub repository authorization metadata is incomplete.");
    if(!isGitHubAppConfigured())throw new Error("GitHub App server configuration is missing.");
    const parsed=parseIdentifier(repo.repositoryIdentifier);assertAllowed(parsed.fullName);
    const token=await createInstallationToken(repo.installationId,repo.githubRepositoryId);
    try{
      const data=await(await githubFetch("/repos/"+encodeURIComponent(parsed.owner)+"/"+encodeURIComponent(parsed.name),token.token)).json() as any;
      if(String(data.id)!==String(repo.githubRepositoryId)||String(data.full_name||"").toLowerCase()!==parsed.fullName.toLowerCase())throw new Error("GitHub repository identity mismatch.");
      if(!data.default_branch&&!allowEmptyRepository)throw new Error("GitHub repository default branch is unavailable.");
      const contentsPermission=token.permissions?.contents;if(contentsPermission!=="read"&&contentsPermission!=="write")throw new Error("GitHub App lacks required repository contents permission.");
      return {owner:parsed.owner,name:parsed.name,fullName:String(data.full_name),defaultBranch:String(data.default_branch||""),private:Boolean(data.private),repositoryId:String(data.id)};
    }finally{try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}}
  }
  async createBranch(repo:AuthorizedRepo,branch:string){
    if(process.env.GITHUB_REPAIR_EXECUTION_ENABLED!=="true")throw new Error("GitHub repair write execution is disabled by default.");
    const meta=await this.validateAuthorizedRepository(repo);if(!safeBranch.test(branch)||protectedBranches.has(branch)||branch===meta.defaultBranch)throw new Error("Unsafe repair branch.");
    const token=await createInstallationToken(repo.installationId!,repo.githubRepositoryId!,true);
    try{
      const base=await(await githubFetch("/repos/"+encodeURIComponent(meta.owner)+"/"+encodeURIComponent(meta.name)+"/git/ref/heads/"+encodeURIComponent(meta.defaultBranch),token.token)).json() as any;
      if(!base.object?.sha)throw new Error("Unable to resolve the protected default branch.");
      await githubFetch("/repos/"+encodeURIComponent(meta.owner)+"/"+encodeURIComponent(meta.name)+"/git/refs",token.token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:"refs/heads/"+branch,sha:base.object.sha})});
    }finally{try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}}
  }
  async createWorkspace(repo:AuthorizedRepo,executionId:string,branch:string){
    if(process.env.GITHUB_REPAIR_EXECUTION_ENABLED!=="true")throw new Error("GitHub repair write execution is disabled by default.");
    const meta=await this.validateAuthorizedRepository(repo);if(!safeBranch.test(branch)||protectedBranches.has(branch)||branch===meta.defaultBranch)throw new Error("Unsafe repair branch.");
    const token=await createInstallationToken(repo.installationId!,repo.githubRepositoryId!,true);const root=await mkdtemp(join(tmpdir(),"aop-repair-authorized-github-"));
    try{await withAskPass(token.token,async env=>{const remote=`https://github.com/${meta.owner}/${meta.name}.git`;const r=await runProcess("git",["clone","--depth","1","--branch",branch,remote,root],root,env,180000);if(r.code!==0)throw new Error("GitHub repository checkout failed.");});await writeFile(join(root,".aop-workspace.json"),JSON.stringify({provider:"GITHUB",repository:meta.fullName,branch,executionId}),"utf8");return{workspaceId:executionId,root,branch,repository:meta.fullName,defaultBranch:meta.defaultBranch};}
    catch(error){await rm(root,{recursive:true,force:true}).catch(()=>{});throw error;}
    finally{try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}}
  }
  async listTrackedFiles(root:string){const r=await runProcess("git",["ls-files"],root,{...process.env,GIT_TERMINAL_PROMPT:"0"},30000);if(r.code!==0)throw new Error("Unable to inspect repository files.");return r.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
  async runSafeCommand(root:string,name:"npm test"|"npm run typecheck"|"npm run build"){
    const args=name==="npm test"?["test"]:name==="npm run typecheck"?["run","typecheck"]:["run","build"];const r=await runProcess("npm",args,root,{...process.env,GIT_TERMINAL_PROMPT:"0",CI:"1"},180000);return{code:r.code,output:(r.stdout+"\n"+r.stderr).slice(-120000),startedAt:r.startedAt};
  }
  async collectChanges(root:string){const r=await runProcess("git",["status","--short"],root,{...process.env,GIT_TERMINAL_PROMPT:"0"},30000);if(r.code!==0)throw new Error("Unable to collect repository changes.");const lines=r.stdout.split(/\r?\n/).map(x=>x.trimEnd()).filter(Boolean);const changes=lines.map(line=>({status:line.slice(0,2).trim(),path:line.slice(3).trim()}));if(changes.some(c=>c.status.includes("D")))throw new Error("Deletion changes are blocked by the execution policy.");return changes;}
  async commitAndPush(repo:AuthorizedRepo,root:string,branch:string,message:string){
    if(process.env.GITHUB_REPAIR_EXECUTION_ENABLED!=="true")throw new Error("GitHub repair write execution is disabled by default.");if(!safeBranch.test(branch)||protectedBranches.has(branch))throw new Error("Unsafe repair branch.");
    const meta=await this.validateAuthorizedRepository(repo);void meta;const token=await createInstallationToken(repo.installationId!,repo.githubRepositoryId!,true);
    try{await withAskPass(token.token,async env=>{const status=await runProcess("git",["status","--short"],root,env);if(status.code!==0)throw new Error("Unable to inspect workspace.");if(status.stdout.split(/\r?\n/).some(x=>x.trim().startsWith("D")))throw new Error("Deletion changes are blocked by the execution policy.");const add=await runProcess("git",["add","--all"],root,env);if(add.code!==0)throw new Error("Unable to stage repair changes.");const commit=await runProcess("git",["-c","user.name=AI Opportunity Platform","-c","user.email=no-reply@ai-opportunity-platform.invalid","commit","-m",message],root,env);if(commit.code!==0)throw new Error("Unable to create repair commit.");const push=await runProcess("git",["push","origin",branch],root,env,180000);if(push.code!==0)throw new Error("Unable to push the isolated repair branch.");});}
    finally{try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}}
    const sha=await runProcess("git",["rev-parse","HEAD"],root,{...process.env,GIT_TERMINAL_PROMPT:"0"},30000);if(sha.code!==0)throw new Error("Unable to resolve repair commit.");return sha.stdout.trim();
  }
  async cleanupWorkspace(root:string){await rm(assertWorkspaceRoot(root),{recursive:true,force:true});}
  safePath(root:string,path:string){return safeWorkspacePath(root,path);}
}