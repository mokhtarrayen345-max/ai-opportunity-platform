import "server-only";
import { createHash } from "node:crypto";
import { createInstallationToken } from "@/services/github-app-client";

export const CONTROLLED_VERIFICATION_REPOSITORY = "mokhtarrayen345-max/ai-opportunity-github-verification-test";
const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const protectedBranches = new Set(["main", "master", "production", "prod"]);

class GitHubHttpError extends Error {
  constructor(readonly status: number) {
    super("GitHub provider request failed.");
  }
}

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
  tokenRevocationSucceeded: boolean;
  code: "VERIFIED_AND_CLEANED" | "VERIFIED_CLEANUP_FAILED" | "BLOCKED" | "FAILED";
};

type Token = { token: string; permissions?: Record<string, string> };
type RunnerDependencies = {
  createToken: (installationId: string, repositoryId: string, write: boolean) => Promise<Token>;
  request: typeof fetch;
  now: () => number;
};

const defaults: RunnerDependencies = { createToken: createInstallationToken, request: fetch, now: Date.now };

function safeExecutionId(id: string) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

export function controlledVerificationBranch(executionId: string) {
  if (!safeExecutionId(executionId)) return null;
  const branch = "github-verification/" + executionId;
  return protectedBranches.has(branch.toLowerCase()) ? null : branch;
}

export async function runControlledGitHubVerification(
  repository: VerificationRepository,
  executionId: string,
  dependencies: Partial<RunnerDependencies> = {},
): Promise<VerificationRunnerResult> {
  const deps = { ...defaults, ...dependencies };
  const blocked = (): VerificationRunnerResult => ({
    verified: false, branch: null, artifactPath: null, remoteVerified: false, cleanupSucceeded: true, tokenRevocationSucceeded: true, code: "BLOCKED",
  });
  if (process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED !== "true") return blocked();
  if (process.env.GITHUB_REPAIR_EXECUTION_ENABLED !== "false") return blocked();
  if (
    repository.repositoryIdentifier !== CONTROLLED_VERIFICATION_REPOSITORY ||
    repository.status !== "ACTIVE" ||
    repository.authorizationStatus !== "AUTHORIZED" ||
    !repository.installationId ||
    !repository.githubRepositoryId ||
    process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY !== CONTROLLED_VERIFICATION_REPOSITORY
  ) return blocked();

  const allowed = new Set((process.env.GITHUB_ALLOWED_REPOSITORIES || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(CONTROLLED_VERIFICATION_REPOSITORY.toLowerCase())) return blocked();
  const branch = controlledVerificationBranch(executionId);
  if (!branch) return blocked();

  const base = "/repos/mokhtarrayen345-max/ai-opportunity-github-verification-test";
  const artifactPath = ".aop-verification/" + executionId + ".json";
  let token: Token | null = null;
  let branchMayExist = false;
  let remoteVerified = false;
  let cleanupSucceeded = true;
  let tokenRevocationSucceeded = true;

  const call = async (path: string, init: RequestInit = {}, allowNotFound = false) => {
    const url = new URL(path, API);
    if (url.origin !== API || (!path.startsWith(base + "/") && path !== base)) throw new Error("scope");
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
    if (!response.ok && !(allowNotFound && response.status === 404)) throw new GitHubHttpError(response.status);
    return response;
  };

  const createTemporaryRef = async (sha: string) => {
    // A timeout may happen after GitHub creates the ref, so uncertain outcomes
    // still trigger cleanup. A definitive 4xx must not delete a pre-existing ref.
    branchMayExist = true;
    try {
      await call(base + "/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: "refs/heads/" + branch, sha }),
      });
    } catch (error) {
      if (error instanceof GitHubHttpError && error.status >= 400 && error.status < 500) {
        branchMayExist = false;
      }
      throw error;
    }
  };

  try {
    token = await deps.createToken(repository.installationId!, repository.githubRepositoryId!, true);
    if (token.permissions?.contents !== "write") throw new Error("permission");

    const repoResponse = await call(base);
    const metadata = await repoResponse.json() as { id?: number; full_name?: string; default_branch?: string };
    if (
      String(metadata.id) !== String(repository.githubRepositoryId) ||
      metadata.full_name?.toLowerCase() !== CONTROLLED_VERIFICATION_REPOSITORY.toLowerCase()
    ) throw new Error("identity");

    const timestamp = deps.now();
    const artifact = {
      schema: "aop-controlled-github-verification/v1",
      executionId,
      repository: CONTROLLED_VERIFICATION_REPOSITORY,
      branch,
      createdAt: new Date(timestamp).toISOString(),
      purpose: "harmless controlled GitHub API write/readback verification",
      nonce: createHash("sha256").update(executionId + ":" + timestamp).digest("hex").slice(0, 24),
    };
    const expected = JSON.stringify(artifact, null, 2) + "\n";
    const defaultBranch = metadata.default_branch?.trim();
    let baseSha: string | null = null;

    // Existing repositories branch from the current default ref without changing it.
    if (defaultBranch) {
      const refResponse = await call(base + "/git/ref/heads/" + encodeURIComponent(defaultBranch), {}, true);
      if (refResponse.status !== 404) {
        const ref = await refResponse.json() as { object?: { sha?: string } };
        if (!ref.object?.sha) throw new Error("base-ref");
        baseSha = ref.object.sha;
      }
    }

    if (baseSha) {
      // The server may accept the create request even if the connection fails before
      // its response arrives, so cleanup must be attempted once creation is attempted.
      await createTemporaryRef(baseSha);
      await call(base + "/contents/" + artifactPath, {
        method: "PUT",
        body: JSON.stringify({
          message: "chore: controlled GitHub verification artifact",
          branch,
          content: Buffer.from(expected, "utf8").toString("base64"),
        }),
      });
    } else {
      // Empty test repositories have no ref to branch from. Build a single orphan commit
      // containing only the verification artifact; never create or update the default branch.
      const blobResponse = await call(base + "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: expected, encoding: "utf-8" }),
      });
      const blob = await blobResponse.json() as { sha?: string };
      if (!blob.sha) throw new Error("blob");
      const treeResponse = await call(base + "/git/trees", {
        method: "POST",
        body: JSON.stringify({ tree: [{ path: artifactPath, mode: "100644", type: "blob", sha: blob.sha }] }),
      });
      const tree = await treeResponse.json() as { sha?: string };
      if (!tree.sha) throw new Error("tree");
      const commitResponse = await call(base + "/git/commits", {
        method: "POST",
        body: JSON.stringify({ message: "chore: controlled GitHub verification artifact", tree: tree.sha, parents: [] }),
      });
      const commit = await commitResponse.json() as { sha?: string };
      if (!commit.sha) throw new Error("commit");
      // See the non-empty repository path above: a lost response does not prove
      // GitHub rejected the create request.
      await createTemporaryRef(commit.sha);
    }

    const readResponse = await call(base + "/contents/" + artifactPath + "?ref=" + encodeURIComponent(branch));
    const remote = await readResponse.json() as { type?: string; path?: string; content?: string; encoding?: string };
    if (remote.type !== "file" || remote.path !== artifactPath || remote.encoding !== "base64" || !remote.content) throw new Error("readback");
    const decoded = Buffer.from(remote.content.replace(/\s/g, ""), "base64").toString("utf8");
    if (decoded !== expected) throw new Error("content-mismatch");
    remoteVerified = true;
  } catch {
    // Provider details, responses, and credentials remain server-side.
  } finally {
    if (branchMayExist && token) {
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
        const revokeResponse = await deps.request(new URL("/installation/token", API), {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            Authorization: "Bearer " + token.token,
          },
          signal: AbortSignal.timeout(10000),
        });
        tokenRevocationSucceeded = revokeResponse.ok || revokeResponse.status === 404;
      } catch {
        tokenRevocationSucceeded = false;
      }
    }
  }

  if (remoteVerified && cleanupSucceeded && tokenRevocationSucceeded) {
    return { verified: true, branch, artifactPath, remoteVerified: true, cleanupSucceeded: true, tokenRevocationSucceeded, code: "VERIFIED_AND_CLEANED" };
  }
  if (remoteVerified) {
    return { verified: false, branch, artifactPath, remoteVerified: true, cleanupSucceeded: false, tokenRevocationSucceeded, code: "VERIFIED_CLEANUP_FAILED" };
  }
  return { verified: false, branch, artifactPath, remoteVerified: false, cleanupSucceeded, tokenRevocationSucceeded, code: "FAILED" };
}
