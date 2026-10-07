import "server-only";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeWorkspacePath } from "@/services/repair-execution-domain";

const API="https://api.github.com";
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const protectedBranches=new Set(["main","master","production","prod"]);

export type GitHubRepositoryMetadata={owner:string;name:string;fullName:string;defaultBranch:string;private:boolean};
export type GitHubProviderConfig={token?:string;enabled:boolean;allowedRepositories:Set<string>};

function config():GitHubProviderConfig{
 const enabled=process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED==="true";
 const token=process.env.GITHUB_APP_TOKEN||process.env.GITHUB_TOKEN;
 const allowed=new Set((process.env.GITHUB_ALLOWED_REPOSITORIES||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
 return {enabled,token,allowedRepositories:allowed};
}
function parseIdentifier(identifier:string){
 if(!repoPattern.test(identifier)) throw new Error("Invalid GitHub repository identifier.");
 const [owner,name]=identifier.split("/");
 return {owner,name,fullName:identifier};
}
function assertAllowed(fullName:string,c= config()){
 if(!c.enabled||!c.token) throw new Error("GitHub repository provider is not securely configured.");
 if(!c.allowedRepositories.has(fullName.toLowerCase())) throw new Error("GitHub repository is not authorized for this application.");
}
async function gh(path:string,init:RequestInit={},c=config()){
 const url=new URL(path,API);
 if(url.origin!==API) throw new Error("GitHub request scope violation.");
 assertAllowed(path.match(/^\/repos\/([^/]+\/[^/]+)/)?.[1]||"",c);
 const headers=new Headers(init.headers);
 headers.set("Accept","application/vnd.github+json"); headers.set("X-GitHub-Api-Version","2022-11-28");
 headers.set("Authorization","Bearer "+c.token);
 const res=await fetch(url,{...init,headers,signal:AbortSignal.timeout(10000)});
 if(!res.ok) {
   if(res.status===401||res.status===403) throw new Error("GitHub authorization failed.");
   if(res.status===404) throw new Error("GitHub repository not found.");
   if(res.status===429) throw new Error("GitHub rate limit reached.");
   throw new Error("GitHub provider request failed.");
 }
 return res;
}
export class GitHubRepositoryProvider{
 async validateRepository(identifier:string):Promise<GitHubRepositoryMetadata>{
   const p=parseIdentifier(identifier); assertAllowed(p.fullName);
   const data=await (await gh(`/repos/${p.owner}/${p.name}`)).json() as any;
   if(data.full_name?.toLowerCase()!==p.fullName.toLowerCase()) throw new Error("GitHub repository identity mismatch.");
   return {owner:p.owner,name:p.name,fullName:data.full_name,defaultBranch:data.default_branch,private:Boolean(data.private)};
 }
 async createBranch(identifier:string,branch:string,defaultBranch:string){
   const p=parseIdentifier(identifier); assertAllowed(p.fullName);
   if(!/^repair\/[A-Za-z0-9_-]+$/.test(branch)||protectedBranches.has(branch)||protectedBranches.has(defaultBranch.toLowerCase())) throw new Error("Unsafe repair branch.");
   const base=await (await gh(`/repos/${p.owner}/${p.name}/git/ref/heads/${encodeURIComponent(defaultBranch)}`)).json() as any;
   const res=await gh(`/repos/${p.owner}/${p.name}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:base.object?.sha})});
   return (await res.json()) as {ref:string};
 }
 async createWorkspace(identifier:string,executionId:string,branch:string){
   const meta=await this.validateRepository(identifier);
   const root=await mkdtemp(join(tmpdir(),"aop-github-repair-"));
   await writeFile(join(root,".aop-workspace.json"),JSON.stringify({provider:"GITHUB",repository:meta.fullName,branch,executionId}),"utf8");
   return {workspaceId:executionId,root,branch,repository:meta.fullName,defaultBranch:meta.defaultBranch};
 }
 safePath(root:string,path:string){return safeWorkspacePath(root,path);}
}