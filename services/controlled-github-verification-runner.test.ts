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

function fakeGitHub(options: { cleanupFails?: boolean; readbackFails?: boolean; empty?: boolean; createResponseLost?: boolean; createRejected?: boolean; createTimedOut?: boolean; revokeFails?: boolean; writeFails?: boolean; identityMismatch?: boolean; readbackMismatch?: boolean } = {}) {
  let artifactContent = "";
  const requests: Array<{ url: string; method: string }> = [];
  const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    requests.push({ url, method });

    if (url.endsWith("/installation/token") && method === "DELETE") return options.revokeFails ? jsonResponse({ message: "denied" }, 500) : new Response(null, { status: 204 });
    if (url.endsWith("/repos/mokhtarrayen345-max/ai-opportunity-github-verification-test") && method === "GET") {
      return jsonResponse({ id: options.identityMismatch ? 99999 : 12345, full_name: CONTROLLED_VERIFICATION_REPOSITORY, default_branch: "main" });
    }
    if (url.endsWith("/git/ref/heads/main") && method === "GET") {
      return options.empty ? jsonResponse({ message: "Not Found" }, 404) : jsonResponse({ object: { sha: "base-sha" } });
    }
    if (url.endsWith("/git/refs") && method === "POST") {
      if (options.createResponseLost) throw new Error("connection dropped after remote create");
      if (options.createRejected) return jsonResponse({ message: "Reference already exists" }, 422);
      if (options.createTimedOut) return jsonResponse({ message: "Request timed out" }, 408);
      return jsonResponse({ ref: "refs/heads/github-verification/exec_test" }, 201);
    }
    if (url.endsWith("/git/blobs") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { content: string };
      artifactContent = body.content;
      return jsonResponse({ sha: "blob-sha" }, 201);
    }
    if (url.endsWith("/git/trees") && method === "POST") return jsonResponse({ sha: "tree-sha" }, 201);
    if (url.endsWith("/git/commits") && method === "POST") return jsonResponse({ sha: "commit-sha" }, 201);
    if (url.includes("/contents/.aop-verification/exec_test.json") && method === "PUT") {
      if (options.writeFails) return jsonResponse({ message: "Unavailable" }, 503);
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
        content: Buffer.from(options.readbackMismatch ? artifactContent + "tampered" : artifactContent, "utf8").toString("base64"),
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

  it("does not delete a ref when the create response is lost and ownership is uncertain", async () => {
    setupEnv();
    const fake = fakeGitHub({ createResponseLost: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(result.verified).toBe(false);
    expect(result.cleanupSucceeded).toBe(false);
    expect(fake.requests.some((item) => item.method === "DELETE" && item.url.includes("/git/refs/heads/"))).toBe(false);
  });



  it("does not delete a ref after an HTTP timeout response", async () => {
    setupEnv();
    const fake = fakeGitHub({ createTimedOut: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(result.cleanupSucceeded).toBe(false);
    expect(fake.requests.some((item) => item.method === "DELETE" && item.url.includes("/git/refs/heads/"))).toBe(false);
  });

  it("cleans the temporary branch when artifact writing fails", async () => {
    setupEnv();
    const fake = fakeGitHub({ writeFails: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(result.verified).toBe(false);
    expect(fake.requests.some((item) => item.method === "PUT" && item.url.includes("/contents/.aop-verification/exec_test.json"))).toBe(true);
    expect(fake.requests.some((item) => item.method === "DELETE" && item.url.includes("/git/refs/heads/github-verification/exec_test"))).toBe(true);
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


  it("rejects mismatched remote repository identity before creating a branch", async () => {
    setupEnv();
    const fake = fakeGitHub({ identityMismatch: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(fake.requests.some((item) => item.method === "POST" && item.url.endsWith("/git/refs"))).toBe(false);
  });

  it("rejects a remote artifact whose content differs from the expected bytes", async () => {
    setupEnv();
    const fake = fakeGitHub({ readbackMismatch: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
      now: () => 1_800_000_000_000,
    });
    expect(result.code).toBe("FAILED");
    expect(result.verified).toBe(false);
    expect(result.remoteVerified).toBe(false);
  });


  it("does not delete a possibly pre-existing branch after a definitive ref rejection", async () => {
    setupEnv();
    const fake = fakeGitHub({ createRejected: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
    });
    expect(result.code).toBe("FAILED");
    expect(fake.requests.some((item) => item.method === "DELETE" && item.url.includes("/git/refs/heads/"))).toBe(false);
  });

  it("reports token revocation failure without exposing credentials", async () => {
    setupEnv();
    const fake = fakeGitHub({ revokeFails: true });
    const result = await runControlledGitHubVerification(repository, "exec_test", {
      createToken: vi.fn(async () => ({ token: "mock-token", permissions: { contents: "write" } })),
      request: fake.request as typeof fetch,
      now: () => 1_800_000_000_000,
    });
    expect(result.code).toBe("VERIFIED_CLEANUP_FAILED");
    expect(result.verified).toBe(false);
    expect(result.cleanupSucceeded).toBe(true);
    expect(result.tokenRevocationSucceeded).toBe(false);
    expect(JSON.stringify(result)).not.toContain("mock-token");
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
