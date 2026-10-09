import "server-only";
import { createPrivateKey } from "node:crypto";
import { z } from "zod";

const repoSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const protectedBranches = new Set(["main", "master", "production", "prod"]);
const CONTROLLED_VERIFICATION_REPOSITORY = "mokhtarrayen345-max/ai-opportunity-github-verification-test";

export const controlledVerificationConfigStatusSchema = z.enum([
  "DISABLED",
  "MISSING_CONFIGURATION",
  "INVALID_CONFIGURATION",
  "READY_FOR_MANUAL_VERIFICATION",
]);
export type ControlledVerificationConfigStatus = z.infer<typeof controlledVerificationConfigStatusSchema>;

export type ControlledVerificationConfigReport = {
  status: ControlledVerificationConfigStatus;
  code: string;
  checks: {
    controlledVerificationEnabled: boolean;
    repairExecutionDisabled: boolean;
    appIdConfigured: boolean;
    clientConfigurationConfigured: boolean;
    privateKeyConfigured: boolean;
    privateKeyValid: boolean;
    verificationRepositoryConfigured: boolean;
    verificationRepositoryValid: boolean;
    verificationRepositoryAllowlisted: boolean;
    verificationRepositorySafe: boolean;
  };
};

const present = (name: string) => Boolean(process.env[name]?.trim());
const configuredRepo = () => process.env.GITHUB_CONTROLLED_VERIFICATION_REPOSITORY?.trim() || "";

export function isSafeVerificationRepository(value: string): boolean {
  if (!repoSchema.safeParse(value).success) return false;
  const [owner, name] = value.split("/");
  if (!owner || !name) return false;
  if (protectedBranches.has(name.toLowerCase())) return false;
  return !["production", "prod"].includes(name.toLowerCase());
}

function allowlisted(value: string): boolean {
  return new Set(
    (process.env.GITHUB_ALLOWED_REPOSITORIES ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ).has(value.toLowerCase());
}

function privateKeyValid(): boolean {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return false;
  try {
    createPrivateKey(raw.replace(/\\n/g, "\n"));
    return true;
  } catch {
    return false;
  }
}

export function getControlledVerificationConfigReport(): ControlledVerificationConfigReport {
  const enabled = process.env.GITHUB_CONTROLLED_VERIFICATION_ENABLED === "true";
  const repairDisabled = process.env.GITHUB_REPAIR_EXECUTION_ENABLED === "false";
  const appIdConfigured = present("GITHUB_APP_ID");
  const clientConfigurationConfigured =
    present("GITHUB_APP_CLIENT_ID") && present("GITHUB_APP_CLIENT_SECRET") && present("GITHUB_APP_SLUG");
  const keyConfigured = present("GITHUB_APP_PRIVATE_KEY");
  const keyValid = keyConfigured && privateKeyValid();
  const repo = configuredRepo();
  const repoConfigured = Boolean(repo);
  const repoValid = repoConfigured && repoSchema.safeParse(repo).success;
  const repoAllowlisted = repoValid && allowlisted(repo);
  const repoSafe = repoValid && isSafeVerificationRepository(repo) && repo === CONTROLLED_VERIFICATION_REPOSITORY;

  const checks = {
    controlledVerificationEnabled: enabled,
    repairExecutionDisabled: repairDisabled,
    appIdConfigured,
    clientConfigurationConfigured,
    privateKeyConfigured: keyConfigured,
    privateKeyValid: keyValid,
    verificationRepositoryConfigured: repoConfigured,
    verificationRepositoryValid: repoValid,
    verificationRepositoryAllowlisted: repoAllowlisted,
    verificationRepositorySafe: repoSafe,
  };

  if (!enabled) return { status: "DISABLED", code: "CONTROLLED_VERIFICATION_DISABLED", checks };
  if (!appIdConfigured || !clientConfigurationConfigured || !keyConfigured || !repoConfigured)
    return { status: "MISSING_CONFIGURATION", code: "CONTROLLED_VERIFICATION_CONFIGURATION_MISSING", checks };
  if (!repairDisabled || !keyValid || !repoValid || !repoAllowlisted || !repoSafe)
    return { status: "INVALID_CONFIGURATION", code: "CONTROLLED_VERIFICATION_CONFIGURATION_INVALID", checks };
  return { status: "READY_FOR_MANUAL_VERIFICATION", code: "CONTROLLED_VERIFICATION_PREFLIGHT_READY", checks };
}
