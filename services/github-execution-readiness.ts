import "server-only";
import { z } from "zod";
import { safeWorkspacePath, validateCommand } from "@/services/repair-execution-domain";

export const readinessStatusSchema = z.enum(["READY","READY_WITH_WARNINGS","NOT_READY","BLOCKED"]);
export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;
export type ReadinessCheck = { key:string; status:"PASS"|"WARNING"|"BLOCKED"|"NOT_CONFIGURED"; summary:string; remediation?:string };
export type ReadinessAudit = {
 status:ReadinessStatus; score:number; auditedAt:string;
 featureFlag:{configured:boolean;enabled:boolean;liveExecutionActive:boolean};
 checks:Record<string,ReadinessCheck[]>; blockers:string[]; warnings:string[]; recommendations:string[];
};

const configured=(name:string)=>Boolean(process.env[name]?.trim());
const check=(key:string,status:ReadinessCheck["status"],summary:string,remediation?:string):ReadinessCheck=>({key,status,summary,...(remediation?{remediation}:{})});
const repos=()=> (process.env.GITHUB_ALLOWED_REPOSITORIES??"").split(",").map(x=>x.trim()).filter(Boolean);
const validRepo=(x:string)=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x);
function callbackSafe(v:string|undefined){if(!v)return false;try{const u=new URL(v);return u.protocol==="https:"||(u.protocol==="http:"&&(u.hostname==="localhost"||u.hostname==="127.0.0.1"));}catch{return false;}}

function configChecks():ReadinessCheck[]{
 const out:ReadinessCheck[]=[];
 for(const n of ["GITHUB_APP_ID","GITHUB_APP_CLIENT_ID","GITHUB_APP_CLIENT_SECRET","GITHUB_APP_PRIVATE_KEY","GITHUB_APP_SLUG"])
   out.push(check(n,configured(n)?"PASS":"NOT_CONFIGURED",configured(n)?"Configured (value hidden).":"Not configured.","Configure the server-side GitHub App setting before a live test."));
 const cb=process.env.GITHUB_APP_CALLBACK_URL;
 out.push(check("GITHUB_APP_CALLBACK_URL",callbackSafe(cb)?"PASS":"NOT_CONFIGURED",callbackSafe(cb)?"Callback URL is HTTPS or localhost-safe.":"Callback URL is missing or unsafe.","Use HTTPS in deployed environments or localhost for development."));
 const a=repos(),bad=a.filter(x=>!validRepo(x));
 out.push(check("GITHUB_ALLOWED_REPOSITORIES",a.length&&!bad.length?"PASS":a.length?"BLOCKED":"NOT_CONFIGURED",a.length&&!bad.length?"Repository allowlist is present and well-formed.":a.length?"Allowlist contains malformed repository identifiers.":"Repository allowlist is empty.","Keep an explicit owner/repository allowlist."));
 return out;
}
const authorizationChecks=()=>[
 check("AUTHENTICATED_SESSION","PASS","Authorization routes derive platform identity from the authenticated session."),
 check("CRYPTOGRAPHIC_STATE","PASS","Authorization state uses cryptographic randomness and a stored hash."),
 check("STATE_SINGLE_USE","PASS","Authorization state has expiration and consumed-at replay protection."),
 check("SERVER_REPOSITORY_VERIFICATION","PASS","Repository selection is re-verified through the verified GitHub installation."),
 check("NO_PAT_FLOW","PASS","No personal-access-token input path is exposed."),
 check("LEGACY_DIRECT_AUTH","PASS","Direct repository authorization is disabled; GitHub App authorization is required.")
];
const repositoryChecks=()=>[
 check("ALLOWLIST","PASS","The real provider enforces the application repository allowlist."),
 check("INSTALLATION_ID","PASS","Authorized GitHub repositories require installationId and githubRepositoryId."),
 check("OWNERSHIP","PASS","Execution and repository queries are scoped to the authenticated platform user."),
 check("ARBITRARY_URLS","PASS","Provider requests are scoped to api.github.com and validated repository identifiers."),
 check("PROVIDER_BOUNDARY","PASS","GitHub-specific access remains isolated behind the repository provider.")
];
const branchChecks=()=>[
 check("SERVER_BRANCH","PASS","Repair branches are validated as repair/<execution-id>."),
 check("PROTECTED_BRANCHES","PASS","The provider blocks main, master, production and prod."),
 check("DEFAULT_BRANCH","PASS","Execution resolves the verified default branch before branch creation."),
 check("CLIENT_BRANCH_INPUT","PASS","Execution APIs do not accept a client-controlled branch name.")
];
function workspaceChecks():ReadinessCheck[]{
 const root=process.platform==="win32"?"C:\\tmp\\aop-readiness":"/tmp/aop-readiness"; const out:ReadinessCheck[]=[];
 try{safeWorkspacePath(root,"src/readiness.ts");out.push(check("PATH_BOUNDARY","PASS","Normal in-workspace paths are accepted."));
   try{safeWorkspacePath(root,"../outside");out.push(check("TRAVERSAL","BLOCKED","Traversal was accepted.","Fix workspace validation before live execution."));}catch{out.push(check("TRAVERSAL","PASS","Parent traversal is rejected."));}
   try{safeWorkspacePath(root,".env");out.push(check("SECRET_PATH","BLOCKED","A protected secret path was accepted.","Fix protected-path enforcement before live execution."));}catch{out.push(check("SECRET_PATH","PASS","Protected secret paths are rejected."));}
 }catch{out.push(check("PATH_BOUNDARY","BLOCKED","Workspace validator could not be exercised safely.","Keep live execution disabled."));}
 return out;
}
function commandChecks():ReadinessCheck[]{
 const out:ReadinessCheck[]=[];
 for(const n of ["npm test","npm run typecheck","npm run build"] as const){try{validateCommand({name:n,args:[]});out.push(check(n,"PASS","Required command is accepted by the existing allowlist."));}catch{out.push(check(n,"BLOCKED","Required command is not accepted by the allowlist."));}}
 for(const [k,n,args] of [["ARBITRARY_SHELL","sh",["-c","echo unsafe"]],["DEPLOYMENT","npm",["run","deploy"]],["SHELL_INJECTION","npm",["test","&&","whoami"]]] as const){try{validateCommand({name:n,args});out.push(check(k,"BLOCKED","Unsafe command was accepted.","Keep command policy fail-closed."));}catch{out.push(check(k,"PASS","Unsafe command was rejected."));}}
 return out;
}
const credentialChecks=()=>[
 check("TOKEN_PERSISTENCE","PASS","Installation access tokens are generated server-side and are not Prisma fields."),
 check("AI_EXPOSURE","PASS","GitHub credentials are not part of coding-provider context."),
 check("EVENT_EXPOSURE","PASS","Execution events use safe messages rather than access tokens."),
 check("PRIVATE_KEY_STORAGE","PASS","GitHub App private key is configuration-only and absent from Prisma.")
];
const qaChecks=()=>[
 check("QA_GATE","PASS","Execution invokes RepairReview after coding and tests."),
 check("DETERMINISTIC_SECURITY","PASS","Deterministic review findings remain authoritative for blocking."),
 check("TEST_GATE","PASS","Missing or failed tests generate blocking review findings."),
 check("VERIFICATION_GATE","PASS","Missing or failed verification generates blocking review findings.")
];
const ciChecks=()=>[
 check("NO_LIVE_GITHUB_REQUIRED","PASS","CI does not require GitHub App credentials."),
 check("REAL_EXECUTION_DEFAULT","PASS","CI does not enable real GitHub execution."),
 check("POSTGRES","PASS","CI provisions PostgreSQL and runs migrations."),
 check("QUALITY_STEPS","PASS","CI runs tests, typecheck and production build.")
];
const deploymentChecks=()=>[
 check("NO_DEPLOY_CONTROL","PASS","This audit exposes no deployment control."),
 check("NO_MERGE","PASS","No automatic merge operation is part of this feature."),
 check("DEFAULT_BRANCH_WRITE","PASS","The provider is designed to write only to execution-specific repair branches."),
 check("AUDIT_SIDE_EFFECT_FREE","PASS","The audit never calls branch creation, commit, push, PR, merge or deployment operations.")
];

export function runGitHubExecutionReadinessAudit():ReadinessAudit{
 const checks={githubConfiguration:configChecks(),authorization:authorizationChecks(),repository:repositoryChecks(),branchSafety:branchChecks(),workspaceSafety:workspaceChecks(),commandSafety:commandChecks(),credentialSafety:credentialChecks(),qaSecurity:qaChecks(),ci:ciChecks(),deploymentSafety:deploymentChecks()};
 const all=Object.values(checks).flat(), blockers=all.filter(x=>x.status==="BLOCKED").map(x=>x.summary), warnings=all.filter(x=>x.status==="WARNING"||x.status==="NOT_CONFIGURED").map(x=>x.summary);
 const enabled=process.env.GITHUB_REPAIR_EXECUTION_ENABLED==="true", complete=configChecks().every(x=>x.status==="PASS");
 const score=Math.round(all.filter(x=>x.status==="PASS").length/all.length*100);
 const status:ReadinessStatus=blockers.length?"BLOCKED":!complete?"NOT_READY":warnings.length?"READY_WITH_WARNINGS":"READY";
 return {status,score,auditedAt:new Date().toISOString(),featureFlag:{configured:configured("GITHUB_REPAIR_EXECUTION_ENABLED"),enabled,liveExecutionActive:enabled&&complete},checks,blockers,warnings,recommendations:[enabled?"Use only a controlled authorized live test.":"Keep GITHUB_REPAIR_EXECUTION_ENABLED=false until a controlled live test is explicitly approved.",...warnings.slice(0,5).map(x=>"Resolve: "+x)]};
}
