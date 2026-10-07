import {z} from "zod";
export const executionStatusSchema=z.enum(["PENDING","AUTHORIZED","RUNNING","TESTING","SUCCEEDED","FAILED","CANCELLED","BLOCKED"]);
export const authorizationStatusSchema=z.enum(["NOT_AUTHORIZED","AUTHORIZED","REVOKED","EXPIRED"]);
export const executionRequestSchema=z.object({repairPlanId:z.string().min(1),authorizedRepositoryId:z.string().min(1)});
export const commandSchema=z.object({name:z.enum(["npm test","npm run typecheck","npm run build","npx prisma generate","npx prisma migrate deploy"]),args:z.array(z.string().max(200)).max(10).default([])});
const sensitive=/(^|\/)(\.env(?:\..*)?|credentials[^/]*|secrets[^/]*|id_rsa|.*\.(pem|key))$/i;
export function safeWorkspacePath(root:string,p:string){if(!p||p.includes("\0"))throw new Error("Invalid workspace path.");const n=p.replaceAll("\\","/");if(sensitive.test(n)||n.startsWith("/")||/^[A-Za-z]:\//.test(n)||n.split("/").includes(".."))throw new Error("Path escapes workspace.");return root+"/"+n;}
export function validateCommand(c:{name:string,args?:string[]}){if(!commandSchema.safeParse(c).success)throw new Error("Command is not allowlisted.");if((c.args||[]).some(a=>/[;&|$<>\n\r]/.test(a)))throw new Error("Unsafe command arguments.");}
export function repairBranch(id:string){return "repair/"+id;}
