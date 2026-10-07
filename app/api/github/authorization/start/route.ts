import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isGitHubAuthorizationConfigured, startGitHubAuthorization } from "@/services/github-authorization";

export async function POST(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isGitHubAuthorizationConfigured()) return NextResponse.json({error:"GitHub App authorization is not configured."},{status:503});
  try{
    const result=await startGitHubAuthorization(user.id);
    return NextResponse.json({authorizationUrl:result.url},{status:200});
  }catch{
    return NextResponse.json({error:"Unable to start GitHub authorization."},{status:503});
  }
}
