import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { analyzeOpportunity } from "@/services/ai";
import { saveAnalysis } from "@/services/persistence";
const schema=z.object({itemId:z.string().min(1)});
export async function POST(request:Request){try{const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid request."},{status:400});const result=await analyzeOpportunity(parsed.data.itemId);const user=await getCurrentUser();if(user)await saveAnalysis(user.id,parsed.data.itemId,result);return NextResponse.json(result);}catch(error){console.error("analyze_error",error);return NextResponse.json({error:"Unable to analyze this item."},{status:500});}}
