import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {MockIntelligenceSource} from "@/services/intelligence-source";
import {processProvider,processSourceItem} from "@/services/intelligence-service";
import {z} from "zod";
const schema=z.object({mode:z.enum(["mock","item"]).default("mock"),item:z.unknown().optional()});
export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const {listRecentSignals}=await import("@/services/intelligence-persistence");return NextResponse.json({signals:await listRecentSignals(user.id)});}

export async function POST(request:Request){try{const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid request."},{status:400});const result=parsed.data.mode==="item"?await processSourceItem(user.id,parsed.data.item):await processProvider(user.id,new MockIntelligenceSource());return NextResponse.json({results:result});}catch(error){console.error("intelligence_ingest_error",error);return NextResponse.json({error:"Unable to process intelligence signals."},{status:500});}}