import{describe,it,expect,afterEach}from"vitest";
import{runGitHubExecutionReadinessAudit}from"@/services/github-execution-readiness";
const original={...process.env};afterEach(()=>{process.env={...original}});
describe("GitHub execution readiness audit",()=>{
 it("keeps real execution disabled when unset",()=>{delete process.env.GITHUB_REPAIR_EXECUTION_ENABLED;const a=runGitHubExecutionReadinessAudit();expect(a.featureFlag.enabled).toBe(false);expect(a.featureFlag.liveExecutionActive).toBe(false)});
 it("never exposes sensitive configuration",()=>{process.env.GITHUB_APP_PRIVATE_KEY="SECRET-KEY";process.env.GITHUB_APP_CLIENT_SECRET="SECRET-CLIENT";const s=JSON.stringify(runGitHubExecutionReadinessAudit());expect(s).not.toContain("SECRET-KEY");expect(s).not.toContain("SECRET-CLIENT")});
 it("checks workspace traversal and protected paths",()=>{const a=runGitHubExecutionReadinessAudit();expect(a.checks.workspaceSafety.find(x=>x.key==="TRAVERSAL")?.status).toBe("PASS");expect(a.checks.workspaceSafety.find(x=>x.key==="SECRET_PATH")?.status).toBe("PASS")});
 it("checks command policy without executing commands",()=>{const a=runGitHubExecutionReadinessAudit();expect(a.checks.commandSafety.find(x=>x.key==="npm test")?.status).toBe("PASS");expect(a.checks.commandSafety.find(x=>x.key==="ARBITRARY_SHELL")?.status).toBe("PASS");expect(a.checks.commandSafety.find(x=>x.key==="DEPLOYMENT")?.status).toBe("PASS")});
 it("reports missing configuration as NOT_READY",()=>{for(const k of ["GITHUB_APP_ID","GITHUB_APP_CLIENT_ID","GITHUB_APP_CLIENT_SECRET","GITHUB_APP_PRIVATE_KEY","GITHUB_APP_SLUG","GITHUB_ALLOWED_REPOSITORIES"])delete process.env[k];expect(runGitHubExecutionReadinessAudit().status).toBe("NOT_READY")});
});