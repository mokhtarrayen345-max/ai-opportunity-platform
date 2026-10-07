import{describe,it,expect}from"vitest";
import{createAuthorizationState,validateAuthorizationState,GITHUB_AUTH_STATE_TTL_MS}from"@/services/github-authorization-state";

describe("GitHub authorization state security",()=>{
 const now=1700000000000;
 it("creates cryptographically random short-lived state metadata",()=>{const a=createAuthorizationState(now),b=createAuthorizationState(now);expect(a.raw).not.toBe(b.raw);expect(a.stateHash).not.toContain(a.raw);expect(a.expiresAt.getTime()).toBe(now+GITHUB_AUTH_STATE_TTL_MS);});
 it("accepts valid user-bound state",()=>{const s=createAuthorizationState(now);expect(validateAuthorizationState({userId:"u1",stateHash:s.stateHash,expiresAt:s.expiresAt,consumedAt:null},"u1",s.raw,now)).toBe(true);});
 it("rejects mismatched user and state",()=>{const s=createAuthorizationState(now);const record={userId:"u1",stateHash:s.stateHash,expiresAt:s.expiresAt,consumedAt:null};expect(validateAuthorizationState(record,"u2",s.raw,now)).toBe(false);expect(validateAuthorizationState(record,"u1","forged",now)).toBe(false);});
 it("rejects expired and replayed state",()=>{const s=createAuthorizationState(now);const expired={userId:"u1",stateHash:s.stateHash,expiresAt:new Date(now-1),consumedAt:null};expect(validateAuthorizationState(expired,"u1",s.raw,now)).toBe(false);const consumed={userId:"u1",stateHash:s.stateHash,expiresAt:s.expiresAt,consumedAt:new Date(now)};expect(validateAuthorizationState(consumed,"u1",s.raw,now)).toBe(false);});
});
