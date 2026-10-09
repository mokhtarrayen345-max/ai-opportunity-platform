import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTROLLED_VERIFICATION_REPOSITORY,
  runControlledGitHubVerification,
  type VerificationRepository,
} from "@/services/controlled-github-verification-runner";

const repository: VerificationRepository = {
  repositoryIdentifier: CONTROLLED_VERIFICATION_REPOSITORY,
  githubRepositoryId: "12345",
  installationId: "67890",
  status: "ACTIVE",
  authorizationStatus: "AUTHORIZED",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setupEnv() {
  vi.stubEnv("GITHUB_CONTROLLED_VERIFICATION_ENABLED", "true");
  vi.stubEnv("GITHUB_REPAIR_EXECUTION_ENABLED", "false");
  vi.stubEnv("GITHUB_CONTROLLED_VERIFICATION_REPOSITORY", CONTROLLED_VERIFICATION_REPOSITORY);
  vi.stubEnv("GITHUB_ALLOWED_REPOSITORIES", CONTROLLED_VERIFICATION_REPOSITORY);
}

function fakeGitHub(options: { cleanupFails?: boolean; readbackFails?: boolean; empty?: boolean } = {}) {
  let artifactContent = "";
  const requests: Array<{ url: string; method: string }> = [];
  const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    requests.push({ url, method });

    if (url.endsWith("/installation/token") && method === "DELETE") return new Response(null, { status: 204 });
    if (url.endsWith("/repos/mokhtarrayen345-max/ai-opportunity-github-verification-test") && method === "GET") {
      return jsonResponse({ id: 12345, full_name: CONTROLLED_VERIFICATION_REPOSITORY, default_branch: "main" });
    }
    if (url.endsWith("/git/ref/heads/main") && method === "GET") {
      return options.empty ? jsonResponse({ message: "Not Found" }, 404) : jsonResponse({ object: { sha: "base-sha" } });
    }
    if (url.endsWith("/git/refs") && method === "POST") return jsonResponse({ ref: "refs/heads/github-verification/exec_test" }, 201);
    if (url.endsWith("/git/blobs") && method === "POST") return jsonResponse({ sha: "blob-sha" }, 201);
    if (url.endsWith("/git/trees") && method === "POST") return jsonResponse({ sha: "tree-sha" }, 201);
    if (url.endsWith("/git/commits") && method === "POST") return jsonResponse({ sha: "commit-sha" }, 201);
    if (url.includes("/contents/.aop-verification/exec_test.json") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { content: string };
      artifactContent = Buffer.from(body.content, "base64").toString("utf8");
      return jsonResponse({ commit: { sha: "artifact-commit" } }, 201);
    }
    if (url.includes("/contents/.aop-verification/exec_test.json?ref=") && method === "GET") {
      if (options.readbackFails) return jsonResponse({ message: "Unavailable" }, 503);
      return jsonResponse({
        type: "file",
        path: ".aop-verification/exec_test.json",
        encoding: "base64",
        content: Buffer.from(artifactContent, "utf8").toString("base64"),
      });
    }
    if (url.includes("/git/refs/heads/github-verification/exec_test") && method === "DELETE") {
      return options.cleanupFails ? jsonResponse({ message: "Forbidden" }, 403) : new Response(null, { status: 204 });
    }
    return jsonResponse({ message: "Unexpected request" }, 500);
  });
  return { request, requests };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("controlled GitHub verification runner", () => {
  it("is blocked unless explicitly enabled", async () => {
    vi.stubEnv("GITHUB_CONTROLLED_VERIFICATION_ENABLED", "false");
    vi.stubEnv("GITHUB_REPAIR_EXECUTION_ENABLED", "false");
    const createToken = vi.fn();
    const result = await runControlledGitHubVerification(repository, "exec_test", { createToken });
    expect(result.code).toBe("BLOCKED");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("rejects a repository outside the fixed verification target", async () => {
    setupEnv();
    const result = await runControlledGitHubVerification({ ...repository, repositoryIdentifier: "owner/other" }, "exec_test", {
      createToken: vi.fn(),
    });
    expect(result.code).toBe("BLOCKED");
  });

  it("blocks when the general repair flag is not explicitly false", async () => {
    setupEnv();
    vi.stubEnv("GITHUB_REPAIR_EXECUTION_ENABLED", "true");
    const result = await runControlledGitHubVerification(repository, "exec_test", { createToken: vi.fn() });
    expect(result.code).toBe("BLOCKED");
  });

  it("writes, remotely verifies, then cleans the temporary branch", async () => {
    setupEnv();
    const fake = fakeGitHub();
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-secret-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
      now: () => 1_800_000_000_000,
    });
    expect(result).toMatchObject({
      verified: true,
      remoteVerified: true,
      cleanupSucceeded: true,
      code: "VERIFIED_AND_CLEANED",
    });
    expect(fake.requests.some((item) => item.method === "DELETE" && item.url.includes("/git/refs/heads/"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("mock-secret-token");
  });

  it("supports an empty repository without touching the default branch", async () => {
    setupEnv();
    const fake = fakeGitHub({ empty: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
      now: () => 1_800_000_000_000,
    });
    expect(result.code).toBe("VERIFIED_AND_CLEANED");
    expect(fake.requests.some((item) => item.method === "POST" && item.url.endsWith("/git/commits"))).toBe(true);
    expect(fake.requests.some((item) => item.method === "PUT" && item.url.includes("/contents/"))).toBe(false);
  });

  it("never reports success when remote readback fails", async () => {
    setupEnv();
    const fake = fakeGitHub({ readbackFails: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(result.verified).toBe(false);
    expect(result.remoteVerified).toBe(false);
  });

  it("never reports success when temporary branch cleanup fails", async () => {
    setupEnv();
    const fake = fakeGitHub({ cleanupFails: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("VERIFIED_CLEANUP_FAILED");
    expect(result.verified).toBe(false);
    expect(result.remoteVerified).toBe(true);
    expect(result.cleanupSucceeded).toBe(false);
  });

  it("does not expose provider failures or tokens", async () => {
    setupEnv();
    const request = vi.fn(async () => jsonResponse({ message: "token=secret-provider-detail" }, 500));
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-secret-token", permissions: { contents: "write" } })),
      request: request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(JSON.stringify(result)).not.toContain("mock-secret-token");
    expect(JSON.stringify(result)).not.toContain("secret-provider-detail");
  });
});
