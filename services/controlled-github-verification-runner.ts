import "server-only";
import { createHash } from "node:crypto";
import { createInstallationToken } from "@/services/github-app-client";

export const CONTROLLED_VERIFICATION_REPOSITORY = "mokhtarrayen345-max/ai-opportunity-github-verification-test";
const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const protectedBranches = new Set(["main", "master", "production", "prod"]);

export type VerificationRepository = {
  repositoryIdentifier: string;
  githubRepositoryId?: string | null;
  installationId?: string | null;
  status: string;
  authorizationStatus: string;
};

export type VerificationRunnerResult = {
  verified: boolean;
  branch: string | null;
  artifactPath: string | null;
  remoteVerified: boolean;
  cleanupSucceeded: boolean;
  code: "VERIFIED_AND_CLEANED" | "VERIFIED_CLEANUP_FAILED" | "BLOCKED" | "FAILED";
};

type Token = { token: string; permissions?: Record<string, string> };
type RunnerDependencies = {
  createToken: (installationId: string, repositoryId: string, write: boolean) => Promise<Token>;
  request: typeof fetch;
  now: () => number;
};

const defaults: RunnerDependencies = {
  createToken: createInstallationToken,
  request: fetch,
  now: Date.now,
};

function safeExecutionId(id: string) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

export function controlledVerificationBranch(executionId: string) {
  if (!safeExecutionId(executionId)) return null;
  const branch = "github-verification/" + executionId;
  return protectedBranches.has(branch.toLowerCase()) ? null : branch;
}

function safeError() {
  return new Error("Controlled GitHub verification failed safely; sensitive provider details were withheld.");
}

export async function runControlledGitHubVerification(
  repository: VerificationRepository,
  executionId: string,
  dependencies: Partial<RunnerDependencies> = {},
): Promise<VerificationRunnerResult> {
  const deps = { ...defaults, ...dependencies };
  if (process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED !== "true") {
    return { verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, code: "BLOCKED" };
  }
  if (process.env.GITHUB_REPAIR_EXECUTION_ENABLED !== "false") {
    return { verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, code: "BLOCKED" };
  }
  if (
    repository.repositoryIdentifier !== CONTROLLED_VERIFICATION_REPOSITORY ||
    repository.status !== "ACTIVE" ||
    repository.authorizationStatus !== "AUTHORIZED" ||
    !repository.installationId ||
    !repository.githubRepositoryId ||
    process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY !== CONTROLLED_VERIFICATION_REPOSITORY
  ) {
    return { verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, code: "BLOCKED" };
  }
  const allowed = new Set((process.env.GITHUB_ALLOWED_REPOSITORIES || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(CONTROLLED_VERIFICATION_REPOSITORY.toLowerCase())) {
    return { verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, code: "BLOCKED" };
  }
  const branch = controlledVerificationBranch(executionId);
  if (!branch) return { verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, code: "BLOCKED" };

  const owner = "mokhtarrayen345-max";
  const name = "ai-opportunity-github-verification-test";
  const base = "/repos/" + owner + "/" + name;
  const artifactPath = ".aop-verification/" + executionId + ".json";
  let token: Token | null = null;
  let branchCreated = false;
  let remoteVerified = false;
  let cleanupSucceeded = true;

  const call = async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, API);
    if (url.origin !== API || !path.startsWith(base + "/") && path !== base) throw new Error("scope");
    const response = await deps.request(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        Authorization: "Bearer " + token!.token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("provider");
    return response;
  };

  try {
    token = await deps.createToken(repository.installationId, repository.githubRepositoryId, true);
    if (token.permissions?.contents !== "write") throw new Error("permission");

    const repoResponse = await call(base);
    const metadata = await repoResponse.json() as { id?: number; full_name?: string; default_branch?: string };
    if (
      String(metadata.id) !== String(repository.githubRepositoryId) ||
      metadata.full_name?.toLowerCase() !== CONTROLLED_VERIFICATION_REPOSITORY.toLowerCase() ||
      !metadata.default_branch ||
      protectedBranches.has(metadata.default_branch.toLowerCase())
    ) throw new Error("identity");

    const defaultRefPath = base + "/git/ref/heads/" + encodeURIComponent(metadata.default_branch);
    const refResponse = await call(defaultRefPath);
    const ref = await refResponse.json() as { object?: { sha?: string } };
    if (!ref.object?.sha) throw new Error("base-ref");

    await call(base + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }),
    });
    branchCreated = true;

    const artifact = {
      schema: "aop-controlled-github-verification/v1",
      executionId,
      repository: CONTROLLED_VERIFICATION_REPOSITORY,
      branch,
      createdAt: new Date(deps.now()).toISOString(),
      purpose: "harmless controlled GitHub API write/readback verification",
      nonce: createHash("sha256").update(executionId + ":" + deps.now()).digest("hex").slice(0, 24),
    };
    const expected = JSON.stringify(artifact, null, 2) + "\n";
    await call(base + "/contents/" + artifactPath, {
      method: "PUT",
      body: JSON.stringify({
        message: "chore: controlled GitHub verification artifact",
        branch,
        content: Buffer.from(expected, "utf8").toString("base64"),
      }),
    });

    const readResponse = await call(base + "/contents/" + artifactPath + "?ref=" + encodeURIComponent(branch));
    const remote = await readResponse.json() as { type?: string; path?: string; content?: string; encoding?: string; sha?: string };
    if (remote.type !== "file" || remote.path !== artifactPath || remote.encoding !== "base64" || !remote.content) throw new Error("readback");
    const decoded = Buffer.from(remote.content.replace(/\s/g, ""), "base64").toString("utf8");
    if (decoded !== expected) throw new Error("content-mismatch");
    remoteVerified = true;
  } catch {
    // The public result never contains raw provider errors, responses, or credentials.
  } finally {
    if (branchCreated && token) {
      try {
        const url = new URL(base + "/git/refs/heads/" + branch.split("/").map(encodeURIComponent).join("/"), API);
        const response = await deps.request(url, {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            Authorization: "Bearer " + token.token,
          },
          signal: AbortSignal.timeout(10000),
        });
        cleanupSucceeded = response.ok || response.status === 404;
      } catch {
        cleanupSucceeded = false;
      }
    }
    if (token) {
      try {
        await deps.request(new URL("/installation/token", API), {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            Authorization: "Bearer " + token.token,
          },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Best-effort token revocation; token values are never logged or returned.
      }
    }
  }

  if (remoteVerified && cleanupSucceeded) {
    return { verified: true, branch, artifactPath, remoteVerified: true, cleanupSucceeded: true, code: "VERIFIED_AND_CLEANED" };
  }
  if (remoteVerified) {
    return { verified: false, branch, artifactPath, remoteVerified: true, cleanupSucceeded: false, code: "VERIFIED_CLEANUP_FAILED" };
  }
  return { verified: false, branch, artifactPath, remoteVerified: false, cleanupSucceeded, code: "FAILED" };
}
