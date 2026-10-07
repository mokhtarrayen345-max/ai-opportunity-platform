import "server-only";
import { createSign } from "node:crypto";

const API="https://api.github.com";
const APP_API_VERSION="2026-03-10";

function b64(value:string|Buffer){return Buffer.from(value).toString("base64url");}
function config(){
  const appId=process.env.GITHUB_APP_ID;
  const privateKey=(process.env.GITHUB_APP_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  if(!appId||!privateKey) throw new Error("GitHub App server configuration is missing.");
  return {appId,privateKey};
}
export function isGitHubAppConfigured(){
  return Boolean(process.env.GITHUB_APP_ID&&process.env.GITHUB_APP_PRIVATE_KEY);
}
export function createGitHubAppJwt(){
  const {appId,privateKey}=config();
  const now=Math.floor(Date.now()/1000);
  const header=b64(JSON.stringify({typ:"JWT",alg:"RS256"}));
  const payload=b64(JSON.stringify({iat:now-60,exp:now+540,iss:appId}));
  const input=header+"."+payload;
  const signer=createSign("RSA-SHA256");
  signer.update(input);
  return input+"."+signer.sign(privateKey).toString("base64url");
}
async function githubFetch(path:string,init:RequestInit={}){
  const url=new URL(path,API);
  if(url.origin!==API) throw new Error("GitHub request scope violation.");
  const res=await fetch(url,{...init,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":APP_API_VERSION,...init.headers},signal:AbortSignal.timeout(10000)});
  if(!res.ok) throw new Error("GitHub authorization provider request failed.");
  return res;
}
export async function verifyInstallation(installationId:string){
  if(!/^\d+$/.test(installationId)) throw new Error("Invalid GitHub installation.");
  const res=await githubFetch("/app/installations/"+encodeURIComponent(installationId),{headers:{Authorization:"Bearer "+createGitHubAppJwt()}});
  return await res.json() as {id:number;account?:{login?:string};permissions?:Record<string,string>;repository_selection?:string;suspended_at?:string|null};
}
export async function createInstallationToken(installationId:string,repositoryId?:string){
  if(!/^\d+$/.test(installationId)) throw new Error("Invalid GitHub installation.");
  const body=repositoryId?JSON.stringify({repository_ids:[Number(repositoryId)],permissions:{metadata:"read",contents:"write"}}):undefined;
  const res=await githubFetch("/app/installations/"+encodeURIComponent(installationId)+"/access_tokens",{method:"POST",headers:{Authorization:"Bearer "+createGitHubAppJwt(),"Content-Type":"application/json"},body});
  return await res.json() as {token:string;expires_at:string;permissions?:Record<string,string>};
}
export async function listInstallationRepositories(installationId:string){
  const token=await createInstallationToken(installationId);
  try{
    const res=await githubFetch("/installation/repositories?per_page=100",{headers:{Authorization:"Bearer "+token.token}});
    const data=await res.json() as {repositories?:Array<any>};
    return (data.repositories||[]).map(r=>({id:String(r.id),fullName:String(r.full_name),owner:String(r.owner?.login||""),name:String(r.name),defaultBranch:String(r.default_branch||"main"),private:Boolean(r.private),permissions:r.permissions||{}}));
  } finally {
    try{await githubFetch("/installation/token",{method:"DELETE",headers:{Authorization:"Bearer "+token.token}});}catch{}
  }
}
