"use client";
import {useEffect,useState} from "react";
type Repo={id:string;name:string;provider:string;repositoryIdentifier:string;defaultBranch:string;authorizationStatus:string;createdAt:string};
export default function Page(){
 const [repos,setRepos]=useState<Repo[]>([]),[name,setName]=useState(""),[identifier,setIdentifier]=useState(""),[message,setMessage]=useState("");
 async function load(){const r=await fetch("/api/repair-repositories");const d=await r.json();if(r.ok)setRepos(d.repositories||[]);}
 useEffect(()=>{void load()},[]);
 async function add(e:React.FormEvent){e.preventDefault();setMessage("");const r=await fetch("/api/repair-repositories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,provider:"GITHUB",repositoryIdentifier:identifier,workspaceRef:"managed:"+crypto.randomUUID().replaceAll("-","").slice(0,20)})});const d=await r.json();if(!r.ok){setMessage(d.error||"Unable to authorize repository.");return}setMessage("Repository authorization recorded.");setName("");setIdentifier("");void load();}
 async function revoke(id:string){const r=await fetch("/api/repair-repositories/"+id+"/revoke",{method:"POST"});if(r.ok)void load();}
 return <div className="container page"><p className="eyebrow">Real Repository Provider V1</p><h1>Authorized repositories</h1><p className="lead narrow">Only explicitly authorized GitHub repositories may be used. Changes are limited to isolated repair branches; no automatic merge or deployment is performed.</p>
 <form onSubmit={add} className="stack"><input aria-label="Repository name" value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" required/><input aria-label="GitHub repository" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="owner/repository" pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+" required/><button type="submit">Authorize GitHub repository</button></form>
 {message&&<p>{message}</p>}<div className="stack">{repos.map(r=><article key={r.id}><strong>{r.repositoryIdentifier}</strong><div>{r.provider} · {r.authorizationStatus} · default: {r.defaultBranch}</div>{r.authorizationStatus==="ACTIVE"&&<button onClick={()=>void revoke(r.id)}>Revoke authorization</button>}</article>)}</div></div>
}