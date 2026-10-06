import "server-only";
import {getPrisma} from "@/lib/db";
import {registerSourceSchema,safeSourceConfig} from "@/services/source-registry-domain";
export async function registerSource(userId:string,input:unknown){const parsed=registerSourceSchema.parse(input);const config=safeSourceConfig(parsed.config);return getPrisma().source.create({data:{id:parsed.id,userId,name:parsed.name,type:parsed.type,description:parsed.description,config,enabled:parsed.enabled,status:parsed.enabled?"UNKNOWN":"DISABLED",health:{create:{status:parsed.enabled?"UNKNOWN":"DISABLED",healthScore:0}}},include:{health:true}});}
export async function listSources(userId:string){return getPrisma().source.findMany({where:{userId},include:{health:true},orderBy:{createdAt:"asc"}});}
export async function getSource(userId:string,id:string){return getPrisma().source.findFirst({where:{id,userId},include:{health:true}});}
export async function setSourceEnabled(userId:string,id:string,enabled:boolean){const source=await getSource(userId,id);if(!source)throw new Error("Source not found.");return getPrisma().source.update({where:{id:source.id},data:{enabled,status:enabled?(source.health?.status==="DISABLED"?"UNKNOWN":source.health?.status??"UNKNOWN"):"DISABLED",health:{update:{status:enabled?(source.health?.status==="DISABLED"?"UNKNOWN":source.health?.status??"UNKNOWN"):"DISABLED"}}},include:{health:true}});}
