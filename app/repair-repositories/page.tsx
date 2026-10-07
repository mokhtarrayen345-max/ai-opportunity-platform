"use client";
import {useEffect,useState} from "react";

type AuthorizedRepo={id:string;name:string;provider:string;repositoryIdentifier:string;defaultBranch:string;authorizationStatus:string;grantedScopes:Record<string,string>|unknown;authorizedAt:string|null;revokedAt:string|null};
type VerifiedRepo={id:string;fullName:string;owner:string;name:string;defaultBranch:string;private:boolean;installationId:string;installationAccount:string;permissions:Record<string,string>};

export default function Page(){
 const [repos,setRepos]=useState<AuthorizedRepo[]>([]);
 const [available,setAvailable]=useState<VerifiedRepo[]>([]);
 const [name,setName]=useState("");
 const [message,setMessage]=useState("");
 const [loading,setLoading]=useState(false);

 async function load(){
  const r=await fetch("/api/repair-repositories");
  const d=await r.json();
  if(r.ok)setRepos(d.repositories||[]);
 }
 async function loadVerified(){
  const r=await fetch("/api/github/authorization/repositories");
  const d=await r.json();
  if(r.ok)setAvailable(d.repositories||[]);
 }
 useEffect(()=>{void load()},[]);

 async function connect(){
  setMessage("");setLoading(true);
  const r=await fetch("/api/github/authorization/start",{method:"POST"});
  const d=await r.json();
  setLoading(false);
  if(!r.ok){setMessage(d.error||"Unable to start GitHub authorization.");return}
  window.location.assign(d.authorizationUrl);
 }
 async function selectRepo(repo:VerifiedRepo){
  setMessage("");
  const display=name.trim()||repo.fullName;
  const r=await fetch("/api/github/authorization/repositories/select",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repositoryId:repo.id,installationId:repo.installationId,name:display})});
  const d=await r.json();
  if(!r.ok){setMessage(d.error||"Repository selection failed.");return}
  setMessage("GitHub repository verified and authorized.");
  setName("");setAvailable([]);void load();
 }
 async function revoke(id:string){
  const r=await fetch("/api/repair-repositories/"+id+"/revoke",{method:"POST"});
  if(r.ok){setMessage("Repository authorization revoked.");void load();}
 }
 return <div className="container page">
  <p className="eyebrow">Secure GitHub Authorization V1</p>
  <h1>GitHub repositories</h1>
  <p className="lead narrow">GitHub App authorization is verified server-side. No PAT, password, or credential is entered here.</p>
  <p><strong>Safety:</strong> GitHub repair execution remains disabled until the secure repository authorization and execution configuration are enabled.</p>
  <button onClick={()=>void connect()} disabled={loading}>{loading?"Connecting…":"Connect GitHub"}</button>
  <button onClick={()=>void loadVerified()} style={{marginLeft:8}}>Refresh verified repositories</button>
  <div className="stack">
   <input aria-label="Repository display name" value={name} onChange={e=>setName(e.target.value)} placeholder="Optional display name" maxLength={100}/>
   {available.map(r=><article key={r.installationId+":"+r.id}>
    <strong>{r.fullName}</strong>
    <div>Installation: {r.installationAccount||"verified"} · default: {r.defaultBranch} · {r.private?"private":"public"}</div>
    <div>Permissions: {Object.entries(r.permissions||{}).map(([k,v])=>k+":"+v).join(", ")||"metadata"}</div>
    <button onClick={()=>void selectRepo(r)}>Authorize this repository</button>
   </article>)}
  </div>
  {message&&<p>{message}</p>}
  <div className="stack">
   {repos.map(r=><article key={r.id}>
    <strong>{r.repositoryIdentifier}</strong>
    <div>{r.provider} · {r.authorizationStatus} · default: {r.defaultBranch}</div>
    <div>Authorized: {r.authorizedAt?new Date(r.authorizedAt).toLocaleString():"—"}</div>
    {r.authorizationStatus==="AUTHORIZED"&&<button onClick={()=>void revoke(r.id)}>Revoke authorization</button>}
   </article>)}
  </div>
 </div>
}
