import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth";
import {getUserOpportunityHistory} from "@/services/opportunity-engine";
export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});return NextResponse.json({opportunities:await getUserOpportunityHistory(user.id)});}
