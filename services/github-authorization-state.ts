import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const GITHUB_AUTH_STATE_TTL_MS=10*60*1000;
export type AuthorizationStateRecord={userId:string;stateHash:string;expiresAt:Date;consumedAt:Date|null};

export function createAuthorizationState(now=Date.now()){
 const raw=randomBytes(32).toString("base64url");
 return {raw,stateHash:createHash("sha256").update(raw).digest("hex"),expiresAt:new Date(now+GITHUB_AUTH_STATE_TTL_MS)};
}
export function validateAuthorizationState(record:AuthorizationStateRecord,userId:string,rawState:string,now=Date.now()){
 if(!rawState||record.userId!==userId||record.consumedAt!==null||record.expiresAt.getTime()<=now)return false;
 const hash=createHash("sha256").update(rawState).digest("hex");
 return hash===record.stateHash;
}
