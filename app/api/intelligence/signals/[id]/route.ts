import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {findSignalById} from "@/services/intelligence-persistence";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const {id}=await params;const signal=await findSignalById(user.id,id);if(!signal)return NextResponse.json({error:"Signal not found."},{status:404});return NextResponse.json({signal});}