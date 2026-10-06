import { NextResponse } from "next/server";
import { z } from "zod";
import { solveProblem } from "@/services/ai";
const schema=z.object({problem:z.string().trim().min(10).max(4000)});
export async function POST(request:Request){try{const body=await request.json();const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Problem must be between 10 and 4000 characters."},{status:400});return NextResponse.json(await solveProblem(parsed.data.problem));}catch(error){console.error("solve_error",error);return NextResponse.json({error:"Unable to solve this problem."},{status:500});}}