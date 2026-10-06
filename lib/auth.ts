import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getPrisma } from "@/lib/db";

const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = "aop_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
async function hashPassword(password:string){
 const salt=randomBytes(16);
 const derived=await scrypt(password,salt,64) as Buffer;
 return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}
async function verifyPassword(password:string,stored:string){
 const [scheme,saltHex,hashHex]=stored.split(":");
 if(scheme!=="scrypt"||!saltHex||!hashHex)return false;
 const derived=await scrypt(password,Buffer.from(saltHex,"hex"),64) as Buffer;
 const expected=Buffer.from(hashHex,"hex");
 return derived.length===expected.length&&timingSafeEqual(derived,expected);
}
export async function createUser(email:string,password:string,name?:string){
 const normalized=email.trim().toLowerCase();
 const passwordHash=await hashPassword(password);
 return getPrisma().user.create({data:{email:normalized,passwordHash,name:name?.trim()||null},select:{id:true,email:true,name:true,createdAt:true}});
}
export async function signIn(email:string,password:string){
 const user=await getPrisma().user.findUnique({where:{email:email.trim().toLowerCase()}});
 if(!user||!(await verifyPassword(password,user.passwordHash))) throw new Error("Invalid credentials");
 const token=randomBytes(32).toString("base64url");
 await getPrisma().session.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+SESSION_TTL_MS)}});
 const store=await cookies();
 store.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_TTL_MS/1000});
 return {id:user.id,email:user.email,name:user.name};
}
export async function signOut(){
 const store=await cookies(); const token=store.get(SESSION_COOKIE)?.value;
 if(token) await getPrisma().session.deleteMany({where:{tokenHash:hashToken(token)}});
 store.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});
}
export async function getCurrentUser(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return null;
 const session=await getPrisma().session.findUnique({where:{tokenHash:hashToken(token)},include:{user:true}});
 if(!session)return null;
 if(session.expiresAt<=new Date()){await getPrisma().session.delete({where:{id:session.id}});return null;}
 return {id:session.user.id,email:session.user.email,name:session.user.name};
}
