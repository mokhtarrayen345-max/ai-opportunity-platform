import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { credentialsSchema } from "@/lib/validation";
export async function POST(request:Request){
 try{const parsed=credentialsSchema.pick({email:true,password:true}).safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid credentials."},{status:400});
 const user=await signIn(parsed.data.email,parsed.data.password);return NextResponse.json({user});
 }catch(error){console.error("signin_error");return NextResponse.json({error:"Invalid credentials."},{status:401});}
}
