import{describe,it,expect,vi,beforeEach}from"vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),start:vi.fn(),complete:vi.fn(),list:vi.fn(),select:vi.fn(),configured:vi.fn()}));
vi.mock("@/lib/auth",()=>({getCurrentUser:mocks.user}));
vi.mock("@/services/github-authorization",()=>({isGitHubAuthorizationConfigured:mocks.configured,startGitHubAuthorization:mocks.start,completeGitHubAuthorization:mocks.complete,listVerifiedGitHubRepositories:mocks.list,selectVerifiedGitHubRepository:mocks.select}));
import{POST as startPOST}from"@/app/api/github/authorization/start/route";
import{GET as callbackGET}from"@/app/api/github/authorization/callback/route";
import{GET as repositoriesGET}from"@/app/api/github/authorization/repositories/route";
import{POST as selectPOST}from"@/app/api/github/authorization/repositories/select/route";
describe("secure GitHub authorization API",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("rejects unauthenticated authorization start",async()=>{mocks.user.mockResolvedValue(null);const r=await startPOST();expect(r.status).toBe(401);});
 it("does not authorize when App configuration is missing",async()=>{mocks.user.mockResolvedValue({id:"u1"});mocks.configured.mockReturnValue(false);const r=await startPOST();expect(r.status).toBe(503);});
 it("starts only for the authenticated platform user",async()=>{mocks.user.mockResolvedValue({id:"u1"});mocks.configured.mockReturnValue(true);mocks.start.mockResolvedValue({url:"https://github.com/apps/test/installations/new?state=opaque"});const r=await startPOST();expect(r.status).toBe(200);expect(mocks.start).toHaveBeenCalledWith("u1");});
 it("rejects unauthenticated repository listing",async()=>{mocks.user.mockResolvedValue(null);const r=await repositoriesGET();expect(r.status).toBe(401);});
 it("lists verified repositories only for the session user",async()=>{mocks.user.mockResolvedValue({id:"u1"});mocks.list.mockResolvedValue([{id:"1",fullName:"owner/repo"}]);const r=await repositoriesGET();expect(r.status).toBe(200);expect(mocks.list).toHaveBeenCalledWith("u1");});
 it("rejects forged repository selection input",async()=>{mocks.user.mockResolvedValue({id:"u1"});const r=await selectPOST(new Request("http://test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repositoryId:"https://github.com/a/b",installationId:"x",name:"repo"})}));expect(r.status).toBe(400);expect(mocks.select).not.toHaveBeenCalled();});
 it("passes only authenticated identity to selection",async()=>{mocks.user.mockResolvedValue({id:"u1"});mocks.select.mockResolvedValue({id:"r1",authorizationStatus:"AUTHORIZED"});const r=await selectPOST(new Request("http://test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repositoryId:"123",installationId:"456",name:"repo",userId:"attacker",authorizationStatus:"AUTHORIZED"})}));expect(r.status).toBe(201);expect(mocks.select).toHaveBeenCalledWith("u1","123","456","repo");});
 it("rejects incomplete callback safely",async()=>{mocks.user.mockResolvedValue({id:"u1"});const r=await callbackGET(new Request("http://test/api/github/authorization/callback?state=s"));expect(r.status).toBe(307);expect(mocks.complete).not.toHaveBeenCalled();});
});
