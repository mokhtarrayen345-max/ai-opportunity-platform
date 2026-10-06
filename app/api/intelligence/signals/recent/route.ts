import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {listRecentSignals} from "@/services/intelligence-persistence";
export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});return NextResponse.json({signals:await listRecentSignals(user.id)});}