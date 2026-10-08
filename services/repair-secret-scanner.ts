const rules=[
{name:"private-key",re:/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ED25519 )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ED25519 )?PRIVATE KEY-----/i},
{name:"github-token",re:/(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}/i},
{name:"generic-api-key",re:/\b(?:sk|rk|pk|api|key|token|secret)[_-]?[A-Za-z0-9]{20,}\b/i},{name:"assigned-api-key",re:/\b(?:api[_-]?key|secret[_-]?key|access[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{20,}["']?/i},
{name:"database-url",re:/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@]+(?::[^\s@]+)?@[^\s]+/i},
{name:"bearer-token",re:/\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*/i},
{name:"aws-access-key",re:/\bAKIA[0-9A-Z]{16}\b/},
{name:"oauth-secret",re:/\b(?:client_secret|refresh_token|access_token)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{20,}["']?/i}
];
export type SecretScan={safe:boolean;redacted:string;matches:string[]};
export function scanSecretContent(content:string):SecretScan{let redacted=content;const matches:string[]=[];for(const rule of rules){if(rule.re.test(content)){matches.push(rule.name);redacted=redacted.replace(rule.re,"[REDACTED_SECRET]");}}return{safe:matches.length===0,redacted,matches};}
export function scanAiFiles(files:Array<{path:string;content:string}>){for(const file of files){if(!scanSecretContent(file.content).safe)throw new Error("AI context blocked: credential-like content detected.");}return files;}
