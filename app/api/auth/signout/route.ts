import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
export async function POST(){try{await signOut();return NextResponse.json({ok:true});}catch(error){console.error("signout_error",error);return NextResponse.json({error:"Unable to sign out."},{status:500});}}
