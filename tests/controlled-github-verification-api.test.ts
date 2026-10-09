import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/services/controlled-github-verification", () => ({
  runControlledVerification: mocks.run,
  verifyClientPayload: (body: unknown) => body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body as object).length === 0,
}));

import { POST } from "@/app/api/github/controlled-verification/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("controlled verification authenticated API", () => {
  it("rejects unauthenticated callers without starting verification", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/github/controlled-verification", { method: "POST", body: "" }));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("token");
  });

  it("rejects client-supplied repository or branch fields", async () => {
    mocks.user.mockResolvedValue({ id: "user-1" });
    const response = await POST(new Request("http://localhost/api/github/controlled-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "mokhtarrayen345-max/ai-opportunity-platform", branch: "main" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("returns a safe authorization failure without exposing provider details", async () => {
    mocks.user.mockResolvedValue({ id: "user-1" });
    mocks.run.mockResolvedValue({
      status: "UNAUTHORIZED",
      executionId: null,
      message: "No active authorized GitHub installation matches the configured verification repository.",
    });
    const response = await POST(new Request("http://localhost/api/github/controlled-verification", { method: "POST", body: "" }));
    expect(response.status).toBe(403);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("UNAUTHORIZED");
    expect(body).not.toContain("private-key");
    expect(body).not.toContain("access-token");
    expect(mocks.run).toHaveBeenCalledWith("user-1");
  });

  it("does not expose unexpected service exceptions", async () => {
    mocks.user.mockResolvedValue({ id: "user-1" });
    mocks.run.mockRejectedValue(new Error("token=secret-provider-detail"));
    const response = await POST(new Request("http://localhost/api/github/controlled-verification", { method: "POST", body: "" }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret-provider-detail");
  });
});
