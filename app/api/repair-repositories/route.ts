import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getPrisma} from "@/lib/db";
import {z} from "zod";
import {GitHubRepositoryProvider} from "@/services/github-repository-provider";
const schema=z.object({
 name:z.string().min(1).max(100),
 provider:z.literal("GITHUB"),
 repositoryIdentifier:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
 workspaceRef:z.string().regex(/^managed:[A-Za-z0-9_-]+$/),
 defaultBranch:z.string().regex(/^[A-Za-z0-9._/-]+$/).max(100).default("main"),
 allowedBranches:z.array(z.string().regex(/^repair\/[A-Za-z0-9_-]+$/)).max(20).default([])
});
export async function GET(){
 const u=await getCurrentUser(); if(!u)return NextResponse.json({error:"Authentication required."},{status:401});
 const rows=await getPrisma().authorizedRepository.findMany({where:{userId:u.id},orderBy:{createdAt:"desc"}});
 return NextResponse.json({repositories:rows.map(r=>({...r,workspaceRef:undefined}))});
}
export async function POST(req:Request){
 const u=await getCurrentUser(); if(!u)return NextResponse.json({error:"Authentication required."},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:"Invalid repository configuration."},{status:400});
 try{
  const provider=new GitHubRepositoryProvider();
  const meta=await provider.validateRepository(parsed.data.repositoryIdentifier);
  const p=getPrisma();
  const r=await p.authorizedRepository.create({data:{
   userId:u.id,name:parsed.data.name,provider:"GITHUB",repositoryIdentifier:meta.fullName,
   repositoryOwner:meta.owner,repositoryName:meta.name,workspaceRef:parsed.data.workspaceRef,
   defaultBranch:meta.defaultBranch,allowedBranches:[],authorizationStatus:"ACTIVE",grantedScopes:["repo:read","repair-branch:write"],status:"ACTIVE"
  }});
  return NextResponse.json({repository:{id:r.id,name:r.name,provider:r.provider,repositoryIdentifier:r.repositoryIdentifier,repositoryOwner:r.repositoryOwner,repositoryName:r.repositoryName,defaultBranch:r.defaultBranch,authorizationStatus:r.authorizationStatus,createdAt:r.createdAt,updatedAt:r.updatedAt}},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to authorize repository."},{status:400});}
}