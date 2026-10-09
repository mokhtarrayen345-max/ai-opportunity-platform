import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { transitionExecution } from "@/services/repair-execution-state-machine";
import { GitHubRepositoryProvider } from "@/services/github-repository-provider";
import { scanSecretContent } from "@/services/repair-secret-scanner";
import { validateCommand } from "@/services/repair-execution-domain";
import { isSafeVerificationRepository } from "@/services/controlled-github-verification-config";
import { runControlledGitHubVerification } from "@/services/controlled-github-verification-runner";

const resultSchema = z.object({
  status: z.enum(["DISABLED", "UNAUTHORIZED", "NOT_CONFIGURED", "REJECTED", "FAILED", "SUCCEEDED"]),
  executionId: z.string().nullable(),
  message: z.string(),
});
export type ControlledVerificationResult = z.infer<typeof resultSchema>;

const enabled = () => process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED === "true";
const configuredRepo = () => process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY?.trim() || null;
const repoAllowed = (repo: string) =>
  new Set((process.env.GITHUB_ALLOWED_REPOSITORIES || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))
    .has(repo.toLowerCase());

export function controlledVerificationConfig() {
  return { enabled: enabled(), repository: configuredRepo() };
}

export function verificationBranch(executionId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(executionId)) return null;
  const branch = "github-verification/" + executionId;
  return /^github-verification\/[A-Za-z0-9_-]+$/.test(branch) ? branch : null;
}

export function verifyClientPayload(body: unknown) {
  return z.object({}).strict().safeParse(body).success;
}

export async function runControlledVerification(
  userId: string,
  provider?: Pick<GitHubRepositoryProvider, "validateAuthorizedRepository">,
): Promise<ControlledVerificationResult> {
  if (!enabled()) return { status: "DISABLED", executionId: null, message: "Controlled GitHub verification is disabled." };

  const target = configuredRepo();
  if (!target) return { status: "NOT_CONFIGURED", executionId: null, message: "Controlled verification repository is not configured." };
  if (!isSafeVerificationRepository(target) || target !== "mokhtarrayen345-max/ai-opportunity-github-verification-test") {
    return { status: "REJECTED", executionId: null, message: "Controlled verification repository configuration is unsafe." };
  }
  if (!repoAllowed(target)) return { status: "REJECTED", executionId: null, message: "Controlled verification repository is not allowlisted." };
  if (process.env.GITHUB_REPAIR_EXECUTION_ENABLED !== "false") {
    return { status: "REJECTED", executionId: null, message: "General repair execution must remain explicitly disabled." };
  }

  const p = getPrisma();
  const repo = await p.authorizedRepository.findFirst({
    where: {
      userId,
      provider: "GITHUB",
      status: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
      repositoryIdentifier: target,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!repo) {
    return { status: "UNAUTHORIZED", executionId: null, message: "No active authorized GitHub installation matches the configured verification repository." };
  }

  const plan = await p.repairPlan.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!plan) return { status: "FAILED", executionId: null, message: "Controlled verification requires an existing repair plan." };

  const execution = await p.repairExecution.create({
    data: { userId, repairPlanId: plan.id, authorizedRepositoryId: repo.id },
  });
  const id = execution.id;

  try {
    await transitionExecution(p, id, "AUTHORIZED", {
      authorizationStatus: "AUTHORIZED",
      authorizedAt: new Date(),
      authorizedBy: userId,
    });

    await (provider || new GitHubRepositoryProvider()).validateAuthorizedRepository(repo, true);
    if (!verificationBranch(id)) {
      throw new Error("Controlled verification preflight failed.");
    }

    const marker = "Controlled verification " + createHash("sha256").update(id).digest("hex").slice(0, 16);
    if (!scanSecretContent(marker).safe) throw new Error("Verification marker failed secret scanning.");
    validateCommand({ name: "npm test", args: [] });

    await transitionExecution(p, id, "RUNNING", {
      workspaceId: "controlled-verification",
      branchName: verificationBranch(id),
      startedAt: new Date(),
      error: null,
    });

    if (process.env.NODE_ENV === "test" || process.env.GITHUB_CONTROLLED_VERIFICATION_MOCK === "true") {
      await transitionExecution(p, id, "TESTING");
      await transitionExecution(p, id, "SUCCEEDED", {
        completedAt: new Date(),
        summary: "Mock controlled verification passed; no GitHub write was performed.",
      });
      return { status: "SUCCEEDED", executionId: id, message: "Mock controlled verification succeeded; no GitHub write was performed." };
    }

    const result = await runControlledGitHubVerification({
      repositoryIdentifier: repo.repositoryIdentifier,
      githubRepositoryId: repo.githubRepositoryId,
      installationId: repo.installationId,
      status: repo.status,
      authorizationStatus: repo.authorizationStatus,
    }, id);

    if (!result.verified || !result.remoteVerified || !result.cleanupSucceeded || result.code !== "VERIFIED_AND_CLEANED") {
      await transitionExecution(p, id, "TESTING");
      await transitionExecution(p, id, "FAILED", {
        completedAt: new Date(),
        error: "Controlled GitHub verification failed or cleanup was incomplete.",
        summary: `Real controlled verification failed closed; remote readback ${result.remoteVerified ? "was verified" : "was not verified"}; temporary branch cleanup ${result.cleanupSucceeded ? "was confirmed or unnecessary" : "was not confirmed"}; installation-token revocation ${result.tokenRevocationSucceeded ? "was confirmed or unnecessary" : "was not confirmed and relies on token expiry"}.`,
      });
      return { status: "FAILED", executionId: id, message: "Controlled GitHub verification failed safely; no successful result was recorded." };
    }

    await transitionExecution(p, id, "TESTING", {
      summary: `Remote artifact verified; temporary branch cleanup succeeded; token revocation ${result.tokenRevocationSucceeded ? "was confirmed" : "was not confirmed and relies on token expiry"}.`,
    });
    await transitionExecution(p, id, "SUCCEEDED", {
      completedAt: new Date(),
      summary: `Real controlled GitHub write/readback verification succeeded and temporary branch cleanup completed; token revocation ${result.tokenRevocationSucceeded ? "was confirmed" : "was not confirmed and relies on token expiry"}.`,
    });
    return { status: "SUCCEEDED", executionId: id, message: "Controlled GitHub verification succeeded and the temporary branch was cleaned up." };
  } catch {
    try {
      // PENDING, AUTHORIZED, RUNNING, and TESTING can all transition directly to FAILED.
      // Preserve the actual state history rather than fabricating successful intermediate stages.
      await transitionExecution(p, id, "FAILED", {
        completedAt: new Date(),
        error: "Controlled verification failed; diagnostics remain server-side.",
      });
    } catch {
      // Preserve the safe public response if the state transition itself fails.
    }
    return { status: "FAILED", executionId: id, message: "Controlled verification failed safely." };
  }
}
