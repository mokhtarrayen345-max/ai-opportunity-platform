import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeGitHubAuthorization } from "@/services/github-authorization";

export async function GET(req:Request){
  const user=await getCurrentUser();
  const url=new URL(req.url);
  if(!user) return NextResponse.redirect(new URL("/login?github=auth-required",url.origin));
  const state=url.searchParams.get("state")||"";
  const code=url.searchParams.get("code")||"";
  const installationId=url.searchParams.get("installation_id")||undefined;
  const githubError=url.searchParams.get("error");
  if(githubError) return NextResponse.redirect(new URL("/repair-repositories?github=error",url.origin));
  try{
    if(!state||!code) throw new Error("incomplete");
    await completeGitHubAuthorization(user.id,state,code,installationId);
    return NextResponse.redirect(new URL("/repair-repositories?github=connected",url.origin));
  }catch{
    return NextResponse.redirect(new URL("/repair-repositories?github=error",url.origin));
  }
}
