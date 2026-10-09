import { z } from "zod";
import { resolveSafeDiagnosticUrl } from "@/services/diagnosis-network";

export const targetTypes = ["WEBSITE", "WEB_APP", "API"] as const;
export const diagnosisTargetInputSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  targetType: z.enum(targetTypes),
  displayName: z.string().trim().max(120).optional(),
  healthEndpoint: z.string().trim().max(512).optional(),
  apiEndpoint: z.string().trim().max(512).optional(),
  enabled: z.boolean().optional(),
});
export type DiagnosisTargetInput = z.infer<typeof diagnosisTargetInputSchema>;

function endpoint(raw: string | undefined, base: URL) {
  if (!raw) return null;
  const url = new URL(raw, base);
  if (url.protocol !== base.protocol || url.origin !== base.origin) {
    throw new Error("Diagnostic endpoints must remain on the target origin.");
  }
  if (url.username || url.password) throw new Error("Embedded credentials are not allowed.");
  url.hash = "";
  return url.toString();
}

export async function validateDiagnosisTarget(input: DiagnosisTargetInput) {
  const resolution = await resolveSafeDiagnosticUrl(input.url);
  const url = resolution.url;
  return {
    targetType: input.targetType,
    displayName: input.displayName?.trim() || null,
    normalizedUrl: url.toString(),
    hostname: url.hostname,
    protocol: url.protocol.replace(":", ""),
    healthEndpoint: endpoint(input.healthEndpoint, url),
    apiEndpoint: endpoint(input.apiEndpoint, url),
    enabled: input.enabled ?? true,
  };
}

export async function assertSafeDiagnosticUrl(raw: string, origin: string) {
  return (await resolveSafeDiagnosticUrl(raw, origin)).url;
}
