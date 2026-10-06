import "server-only";
import {getPrisma} from "@/lib/db";
export async function saveIntelligenceSignal(userId:string,data:any){return getPrisma().intelligenceSignal.create({data:{...data,userId}});}
export async function findSignalById(userId:string,id:string){return getPrisma().intelligenceSignal.findFirst({where:{id,userId}});}
export async function findSignalByFingerprint(userId:string,fingerprint:string){return getPrisma().intelligenceSignal.findUnique({where:{userId_fingerprint:{userId,fingerprint}}});}
export async function listRecentSignals(userId:string){return getPrisma().intelligenceSignal.findMany({where:{userId},orderBy:{receivedAt:"desc"},take:50});}
export async function markSignalAnalyzed(userId:string,id:string){return getPrisma().intelligenceSignal.updateMany({where:{id,userId},data:{opportunityAnalysisStatus:"analyzed",lastOpportunityAnalyzedAt:new Date()}});}
