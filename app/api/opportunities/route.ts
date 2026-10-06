import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {assessOpportunity} from "@/services/opportunity-engine";
import {z} from "zod";
const schema=z.object({input:z.string().trim().min(10).max(4000),save:z.boolean().optional()});
export async function POST(request:Request){try{const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Input must be between 10 and 4000 characters."},{status:400});const user=await getCurrentUser();const wantsSave=parsed.data.save===true;if(wantsSave&&!user)return NextResponse.json({error:"Sign in to save opportunity assessments."},{status:401});return NextResponse.json(await assessOpportunity(parsed.data.input,{persist:wantsSave,userId:user?.id}));}catch(error){console.error("opportunity_error",error);return NextResponse.json({error:"Unable to assess this opportunity."},{status:500});}}
