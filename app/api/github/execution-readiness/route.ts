import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runGitHubExecutionReadinessAudit } from "@/services/github-execution-readiness";
export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});return NextResponse.json({audit:runGitHubExecutionReadinessAudit()});}