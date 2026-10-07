import "server-only";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeWorkspacePath } from "@/services/repair-execution-domain";
import { createInstallationToken, isGitHubAppConfigured } from "@/services/github-app-client";

const API="https://api.github.com";
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const protectedBranches=new Set(["main","master","production","prod"]);

export type GitHubRepositoryMetadata={owner:string;name:string;fullName:string;defaultBranch:string;private:boolean;repositoryId:string};
type AuthorizedRepo={repositoryIdentifier:string;repositoryOwner?:string|null;repositoryName?:string|null;githubRepositoryId?:string|null;installationId?:string|null;authorizationStatus:string;status:string};

function parseIdentifier(identifier:string){
  if(!repoPattern.test(identifier)) throw new Error("Invalid GitHub repository identifier.");
  const [owner,name]=identifier.split("/");
  return {owner,name,fullName:identifier};
}
function assertAllowed(fullName:string){
  const allowed=new Set((process.env.GITHUB_ALLOWED_REPOSITORIES||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
  if(!allowed.has(fullName.toLowerCase())) throw new Error("GitHub repository is not authorized for this application.");
}
async function githubFetch(path:string,token:string,init:RequestInit={}){
  const url=new URL(path,API);
  if(url.origin!==API) throw new Error("GitHub request scope violation.");
  const res=await fetch(url,{...init,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10",Authorization:"Bearer "+token,...init.headers},signal:AbortSignal.timeout(10000)});
  if(!res.ok){
    if(res.status===401||res.status===403) throw new Error("GitHub authorization failed.");
    if(res.status===404) throw new Error("GitHub repository not found.");
    if(res.status===429) throw new Error("GitHub rate limit reached.");
    throw new Error("GitHub provider request failed.");
  }
  return res;
}

export class GitHubRepositoryProvider{
  async validateAuthorizedRepository(repo:AuthorizedRepo):Promise<GitHubRepositoryMetadata>{
    if(repo.status!=="ACTIVE"||repo.authorizationStatus!=="AUTHORIZED") throw new Error("GitHub repository authorization is not active.");
    if(!repo.installationId||!repo.githubRepositoryId) throw new Error("GitHub repository authorization metadata is incomplete.");
    if(!isGitHubAppConfigured()) throw new Error("GitHub App server configuration is missing.");
    const parsed=parseIdentifier(repo.repositoryIdentifier);
    assertAllowed(parsed.fullName);
    const token=await createInstallationToken(repo.installationId,repo.githubRepositoryId);
    try{
      const data=await (await githubFetch("/repos/"+encodeURIComponent(parsed.owner)+"/"+encodeURIComponent(parsed.name),token.token)).json() as any;
      if(String(data.id)!==String(repo.githubRepositoryId)||String(data.full_name||"").toLowerCase()!==parsed.fullName.toLowerCase()) throw new Error("GitHub repository identity mismatch.");
      if(!data.default_branch) throw new Error("GitHub repository default branch is unavailable.");
      const contentsPermission=token.permissions?.contents;
      if(contentsPermission!=="read"&&contentsPermission!=="write") throw new Error("GitHub App lacks required repository contents permission.");
      return {owner:parsed.owner,name:parsed.name,fullName:String(data.full_name),defaultBranch:String(data.default_branch),private:Boolean(data.private),repositoryId:String(data.id)};
    } finally {
      try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}
    }
  }
  async createBranch(repo:AuthorizedRepo,branch:string){
    if(process.env.GITHUB_REPAIR_EXECUTION_ENABLED!=="true") throw new Error("GitHub repair write execution is disabled by default.");
    const meta=await this.validateAuthorizedRepository(repo);
    if(!/^repair\/[A-Za-z0-9_-]+$/.test(branch)||protectedBranches.has(branch)||branch===meta.defaultBranch) throw new Error("Unsafe repair branch.");
    const token=await createInstallationToken(repo.installationId!,repo.githubRepositoryId!);
    try{
      const base=await (await githubFetch("/repos/"+encodeURIComponent(meta.owner)+"/"+encodeURIComponent(meta.name)+"/git/ref/heads/"+encodeURIComponent(meta.defaultBranch),token.token)).json() as any;
      if(!base.object?.sha) throw new Error("Unable to resolve the protected default branch.");
      const res=await githubFetch("/repos/"+encodeURIComponent(meta.owner)+"/"+encodeURIComponent(meta.name)+"/git/refs",token.token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:"refs/heads/"+branch,sha:base.object.sha})});
      return (await res.json()) as {ref:string};
    } finally {
      try{await githubFetch("/installation/token",token.token,{method:"DELETE"});}catch{}
    }
  }
  async createWorkspace(repo:AuthorizedRepo,executionId:string,branch:string){
    const meta=await this.validateAuthorizedRepository(repo);
    const root=await mkdtemp(join(tmpdir(),"aop-github-repair-"));
    await writeFile(join(root,".aop-workspace.json"),JSON.stringify({provider:"GITHUB",repository:meta.fullName,branch,executionId}),"utf8");
    return {workspaceId:executionId,root,branch,repository:meta.fullName,defaultBranch:meta.defaultBranch};
  }
  safePath(root:string,path:string){return safeWorkspacePath(root,path);}
}
