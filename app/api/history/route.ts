import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserHistory } from "@/services/persistence";
export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 return NextResponse.json(await getUserHistory(user.id));
}
