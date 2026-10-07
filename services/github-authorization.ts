import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db";
import { isGitHubAppConfigured, listInstallationRepositories } from "@/services/github-app-client";

const STATE_TTL_MS=10*60*1000;
const STATE_COOKIE="aop_github_authorization";

function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function b64url(value:Buffer){return value.toString("base64url");}
function config(){
  const clientId=process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret=process.env.GITHUB_APP_CLIENT_SECRET;
  const slug=process.env.GITHUB_APP_SLUG;
  const callback=process.env.GITHUB_APP_CALLBACK_URL;
  if(!clientId||!clientSecret||!slug||!callback) throw new Error("GitHub App authorization is not configured.");
  const url=new URL(callback);
  if(url.protocol!=="https:"&&process.env.NODE_ENV==="production") throw new Error("GitHub callback must use HTTPS.");
  return {clientId,clientSecret,slug,callback};
}
export function isGitHubAuthorizationConfigured(){return Boolean(process.env.GITHUB_APP_CLIENT_ID&&process.env.GITHUB_APP_CLIENT_SECRET&&process.env.GITHUB_APP_SLUG&&process.env.GITHUB_APP_CALLBACK_URL);}
export async function startGitHubAuthorization(userId:string){
  const {clientId,slug,callback}=config();
  const state=b64url(randomBytes(32));
  const p=getPrisma();
  await p.githubAuthorizationState.deleteMany({where:{userId,expiresAt:{lt:new Date()}}});
  await p.githubAuthorizationState.create({data:{userId,stateHash:hash(state),expiresAt:new Date(Date.now()+STATE_TTL_MS)}});
  const url=new URL("https://github.com/apps/"+encodeURIComponent(slug)+"/installations/new");
  url.searchParams.set("state",state);
  return {url:url.toString(),callback,clientId};
}
async function exchangeCode(code:string){
  const {clientId,clientSecret,callback}=config();
  const res=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,redirect_uri:callback}),signal:AbortSignal.timeout(10000)});
  if(!res.ok) throw new Error("GitHub authorization exchange failed.");
  const data=await res.json() as {access_token?:string;error?:string};
  if(!data.access_token) throw new Error("GitHub authorization was not completed.");
  return data.access_token;
}
async function userInstallations(token:string){
  const res=await fetch("https://api.github.com/user/installations?per_page=100",{headers:{Accept:"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2026-03-10"},signal:AbortSignal.timeout(10000)});
  if(!res.ok) throw new Error("Unable to verify GitHub installation ownership.");
  const data=await res.json() as {installations?:Array<any>};
  return (data.installations||[]).map(i=>({id:String(i.id),account:String(i.account?.login||""),permissions:i.permissions||{},repositorySelection:String(i.repository_selection||"unknown")})).filter(i=>/^\d+$/.test(i.id));
}
export async function completeGitHubAuthorization(userId:string,state:string,code:string,callbackInstallationId?:string){
  if(!state||!code) throw new Error("GitHub authorization callback is incomplete.");
  const p=getPrisma();
  const record=await p.githubAuthorizationState.findFirst({where:{userId,stateHash:hash(state),consumedAt:null}});
  if(!record||record.expiresAt<=new Date()) throw new Error("GitHub authorization state is invalid or expired.");
  const store=await cookies();
  const token=await exchangeCode(code);
  const installations=await userInstallations(token);
  if(!installations.length) throw new Error("No verified GitHub App installation is available for this user.");
  const selected=callbackInstallationId&&installations.some(i=>i.id===callbackInstallationId)?callbackInstallationId:(installations.length===1?installations[0].id:null);
  await p.githubAuthorizationState.update({where:{id:record.id},data:{consumedAt:new Date(),installationId:selected,availableInstallations:installations}});
  store.set(STATE_COOKIE,record.id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600});
  return {selectedInstallationId:selected,installations};
}
export async function getAuthorizationContext(userId:string){
  const id=(await cookies()).get(STATE_COOKIE)?.value;
  if(!id) return null;
  const record=await getPrisma().githubAuthorizationState.findFirst({where:{id,userId,consumedAt:{not:null},expiresAt:{gt:new Date()}}});
  if(!record) return null;
  return record;
}
export async function listVerifiedGitHubRepositories(userId:string){
  if(!isGitHubAppConfigured()) throw new Error("GitHub App authorization is not configured.");
  const record=await getAuthorizationContext(userId);
  if(!record) throw new Error("No active verified GitHub authorization session.");
  const installations=Array.isArray(record.availableInstallations)?record.availableInstallations as Array<{id:string;account:string;permissions:Record<string,string>;repositorySelection:string}>:[];
  const selected=record.installationId?installations.filter(i=>i.id===record.installationId):installations;
  const results=[];
  for(const installation of selected){
    const repos=await listInstallationRepositories(installation.id);
    results.push(...repos.map(r=>({...r,installationId:installation.id,installationAccount:installation.account})));
  }
  return results;
}
export async function selectVerifiedGitHubRepository(userId:string,repositoryId:string,installationId:string,name:string){
  if(!/^\d+$/.test(repositoryId)||!/^[0-9]+$/.test(installationId)) throw new Error("Invalid GitHub repository selection.");
  const record=await getAuthorizationContext(userId);
  if(!record) throw new Error("No active verified GitHub authorization session.");
  const installations=Array.isArray(record.availableInstallations)?record.availableInstallations as Array<{id:string;account:string;permissions:Record<string,string>;repositorySelection:string}>:[];
  if(!installations.some(i=>i.id===installationId)) throw new Error("GitHub installation is not authorized for this user.");
  const repo=(await listInstallationRepositories(installationId)).find(r=>r.id===repositoryId);
  if(!repo) throw new Error("Repository is not accessible through the verified GitHub installation.");
  const allowed=new Set((process.env.GITHUB_ALLOWED_REPOSITORIES||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean));
  if(!allowed.has(repo.fullName.toLowerCase())) throw new Error("GitHub repository is not authorized for this application.");
  const workspaceRef="managed:"+randomBytes(12).toString("hex");
  const p=getPrisma();
  const saved=await p.authorizedRepository.upsert({where:{userId_provider_repositoryIdentifier:{userId,provider:"GITHUB",repositoryIdentifier:repo.fullName}},update:{name:name.trim(),repositoryOwner:repo.owner,repositoryName:repo.name,githubRepositoryId:repo.id,installationId,defaultBranch:repo.defaultBranch,allowedBranches:[],authorizationStatus:"AUTHORIZED",grantedScopes:repo.permissions,authorizedAt:new Date(),revokedAt:null,status:"ACTIVE"},create:{userId,name:name.trim(),provider:"GITHUB",repositoryIdentifier:repo.fullName,repositoryOwner:repo.owner,repositoryName:repo.name,githubRepositoryId:repo.id,installationId,workspaceRef,defaultBranch:repo.defaultBranch,allowedBranches:[],authorizationStatus:"AUTHORIZED",grantedScopes:repo.permissions,authorizedAt:new Date(),status:"ACTIVE"}});
  (await cookies()).set(STATE_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});
  return {id:saved.id,name:saved.name,provider:saved.provider,repositoryIdentifier:saved.repositoryIdentifier,repositoryOwner:saved.repositoryOwner,repositoryName:saved.repositoryName,defaultBranch:saved.defaultBranch,authorizationStatus:saved.authorizationStatus,grantedScopes:saved.grantedScopes,authorizedAt:saved.authorizedAt,createdAt:saved.createdAt,updatedAt:saved.updatedAt};
}
