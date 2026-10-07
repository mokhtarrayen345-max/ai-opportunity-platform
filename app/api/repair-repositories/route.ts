import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  const rows=await getPrisma().authorizedRepository.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"}});
  return NextResponse.json({repositories:rows.map(r=>({id:r.id,name:r.name,provider:r.provider,repositoryIdentifier:r.repositoryIdentifier,repositoryOwner:r.repositoryOwner,repositoryName:r.repositoryName,defaultBranch:r.defaultBranch,authorizationStatus:r.authorizationStatus,grantedScopes:r.grantedScopes,authorizedAt:r.authorizedAt,revokedAt:r.revokedAt,status:r.status,createdAt:r.createdAt,updatedAt:r.updatedAt}))});
}

export async function POST(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  return NextResponse.json({error:"Direct repository authorization is disabled. Use the GitHub App authorization flow."},{status:410});
}
