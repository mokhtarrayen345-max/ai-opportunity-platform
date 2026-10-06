import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { solveProblem } from "@/services/ai";
import { saveSolverResult } from "@/services/persistence";
import { problemSchema } from "@/lib/validation";
export async function POST(request:Request){try{const parsed=problemSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Problem must be between 10 and 4000 characters."},{status:400});const result=await solveProblem(parsed.data.problem);const user=await getCurrentUser();if(user)await saveSolverResult(user.id,parsed.data.problem,result);return NextResponse.json(result);}catch(error){console.error("solve_error",error);return NextResponse.json({error:"Unable to solve this problem."},{status:500});}}
