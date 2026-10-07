import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getPrisma} from "@/lib/db";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getCurrentUser(); if(!u)return NextResponse.json({error:"Authentication required."},{status:401});
 const id=(await params).id;
 const p=getPrisma();
 const repo=await p.authorizedRepository.findFirst({where:{id,userId:u.id}});
 if(!repo)return NextResponse.json({error:"Repository not found."},{status:404});
 const r=await p.authorizedRepository.update({where:{id},data:{authorizationStatus:"REVOKED",status:"REVOKED",revokedAt:new Date()}});
 return NextResponse.json({repository:{id:r.id,authorizationStatus:r.authorizationStatus,status:r.status,revokedAt:r.revokedAt}});
}