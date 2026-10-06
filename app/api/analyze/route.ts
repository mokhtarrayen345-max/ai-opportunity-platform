import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeOpportunity } from "@/services/ai";
const schema=z.object({itemId:z.string().min(1)});
export async function POST(request:Request){try{const body=await request.json();const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid request."},{status:400});return NextResponse.json(await analyzeOpportunity(parsed.data.itemId));}catch(error){console.error("analyze_error",error);return NextResponse.json({error:"Unable to analyze this item."},{status:500});}}