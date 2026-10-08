import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getControlledVerificationConfigReport } from "@/services/controlled-github-verification-config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  const report = getControlledVerificationConfigReport();
  const httpStatus =
    report.status === "READY_FOR_MANUAL_VERIFICATION"
      ? 200
      : report.status === "DISABLED"
        ? 403
        : report.status === "MISSING_CONFIGURATION"
          ? 503
          : 500;

  return NextResponse.json({
    preflight: {
      ...report,
      realVerificationStatus: "NOT_PERFORMED",
      message:
        report.status === "READY_FOR_MANUAL_VERIFICATION"
          ? "Local configuration prerequisites are valid for a manual controlled verification. Real GitHub execution has not been performed."
          : "Controlled verification is not ready for a real run.",
    },
  }, { status: httpStatus });
}
