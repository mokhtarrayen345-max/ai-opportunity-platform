import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { selectVerifiedGitHubRepository } from "@/services/github-authorization";
import { z } from "zod";

const schema=z.object({repositoryId:z.string().regex(/^\d+$/),installationId:z.string().regex(/^\d+$/),name:z.string().trim().min(1).max(100)});

export async function POST(req:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid repository selection."},{status:400});
  try{
    const repository=await selectVerifiedGitHubRepository(user.id,parsed.data.repositoryId,parsed.data.installationId,parsed.data.name);
    return NextResponse.json({repository},{status:201});
  }catch{
    return NextResponse.json({error:"Repository selection could not be verified."},{status:403});
  }
}
