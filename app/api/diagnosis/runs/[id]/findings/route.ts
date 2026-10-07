import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getPrisma} from "@/lib/db";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const id=(await params).id;
 const run=await getPrisma().diagnosisRun.findFirst({where:{id,userId:user.id},select:{id:true}});
 if(!run)return NextResponse.json({error:"Diagnosis run not found."},{status:404});
 const findings=await getPrisma().diagnosticFinding.findMany({where:{runId:run.id,userId:user.id},orderBy:{createdAt:"asc"}});
 return NextResponse.json({items:findings});
}
