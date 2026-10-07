import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listVerifiedGitHubRepositories } from "@/services/github-authorization";

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  try{
    const repositories=await listVerifiedGitHubRepositories(user.id);
    return NextResponse.json({repositories});
  }catch{
    return NextResponse.json({error:"No active verified GitHub authorization is available."},{status:403});
  }
}
