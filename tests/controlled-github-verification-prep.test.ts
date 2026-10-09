import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const original = { ...process.env };
const routeMocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: routeMocks.user }));
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); });

const validKey = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();

function validEnvironment() {
  process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED = "true";
  process.env.GITHUB_REPAIR_EXECUTION_ENABLED = "false";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_CLIENT_ID = "client";
  process.env.GITHUB_APP_CLIENT_SECRET = "client-secret";
  process.env.GITHUB_APP_SLUG = "ai-opportunity-platform";
  process.env.GITHUB_APP_PRIVATE_KEY = validKey();
  process.env.GITHUB_ALLOWED_REPOSITORIES = "mokhtarrayen345-max/ai-opportunity-github-verification-test";
  process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY = "mokhtarrayen345-max/ai-opportunity-github-verification-test";
}

describe("controlled GitHub verification preparation", () => {
  it("is disabled by default", async () => {
    delete process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED;
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    expect(getControlledVerificationConfigReport().status).toBe("DISABLED");
  });

  it("distinguishes missing App and repository configuration", async () => {
    process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED = "true";
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    const report = getControlledVerificationConfigReport();
    expect(report.status).toBe("MISSING_CONFIGURATION");
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
  });

  it("rejects malformed private keys without exposing the value", async () => {
    validEnvironment();
    process.env.GITHUB_APP_PRIVATE_KEY = "SUPER-SECRET-NOT-A-KEY";
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    const report = getControlledVerificationConfigReport();
    expect(report.status).toBe("INVALID_CONFIGURATION");
    expect(JSON.stringify(report)).not.toContain("SUPER-SECRET");
  });

  it("rejects invalid, protected, and non-allowlisted verification repositories", async () => {
    validEnvironment();
    const { isSafeVerificationRepository, getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    expect(isSafeVerificationRepository("owner/main")).toBe(false);
    expect(isSafeVerificationRepository("owner/master")).toBe(false);
    expect(isSafeVerificationRepository("not valid/repo")).toBe(false);
    process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY = "owner/not-allowlisted";
    expect(getControlledVerificationConfigReport().status).toBe("INVALID_CONFIGURATION");
  });

  it("reports manual-verification readiness without claiming real execution", async () => {
    validEnvironment();
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    const report = getControlledVerificationConfigReport();
    expect(report.status).toBe("READY_FOR_MANUAL_VERIFICATION");
    expect(JSON.stringify(report)).not.toContain("client-secret");
  });

  it("requires the general repair flag to be explicitly false", async () => {
    validEnvironment();
    delete process.env.GITHUB_REPAIR_EXECUTION_ENABLED;
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    const report = getControlledVerificationConfigReport();
    expect(report.checks.repairExecutionDisabled).toBe(false);
    expect(report.status).toBe("INVALID_CONFIGURATION");
  });

  it("requires the one fixed dedicated verification target", async () => {
    validEnvironment();
    process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY = "owner/verification-repo";
    process.env.GITHUB_ALLOWED_REPOSITORIES = "owner/verification-repo";
    const { getControlledVerificationConfigReport } = await import("@/services/controlled-github-verification-config");
    expect(getControlledVerificationConfigReport().status).toBe("INVALID_CONFIGURATION");
  });
});

describe("controlled verification preflight API", () => {
  it("is authenticated and read-only", async () => {
    routeMocks.user.mockResolvedValue({ id: "u1" });
    validEnvironment();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/github/verification-preflight/route");
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.preflight.realVerificationStatus).toBe("NOT_PERFORMED");
    expect(payload.preflight.status).toBe("READY_FOR_MANUAL_VERIFICATION");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated preflight requests", async () => {
    routeMocks.user.mockResolvedValue(null);
    validEnvironment();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/github/verification-preflight/route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated controlled verification requests before calling the service", async () => {
    routeMocks.user.mockResolvedValue(null);
    const { POST } = await import("@/app/api/github/controlled-verification/route");
    const response = await POST(new Request("http://localhost/api/github/controlled-verification", { method: "POST", body: "" }));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("token");
  });

  it("does not expose credentials or tokens", async () => {
    routeMocks.user.mockResolvedValue({ id: "u1" });
    validEnvironment();
    process.env.GITHUB_APP_PRIVATE_KEY = "SECRET-KEY";
    const { GET } = await import("@/app/api/github/verification-preflight/route");
    const payload = await GET();
    const body = JSON.stringify(await payload.json());
    expect(body).not.toContain("SECRET-KEY");
    expect(body).not.toContain("client-secret");
    expect(body).not.toContain("token");
  });
});
