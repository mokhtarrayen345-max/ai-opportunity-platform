import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth";
import { credentialsSchema } from "@/lib/validation";
export async function POST(request:Request){
 try{const parsed=credentialsSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid signup data."},{status:400});
 const user=await createUser(parsed.data.email,parsed.data.password,parsed.data.name);return NextResponse.json({user},{status:201});
 }catch(error){console.error("signup_error",error);return NextResponse.json({error:"Unable to create account."},{status:409});}
}
