import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runControlledVerification, verifyClientPayload } from "@/services/controlled-github-verification";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required." } },
      { status: 401 },
    );
  }

  const rawBody = await req.text();
  let body: unknown = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "Request body must be empty or a JSON object with no fields." } },
        { status: 400 },
      );
    }
  }

  if (!verifyClientPayload(body)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Request body must be empty or a JSON object with no fields." } },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await runControlledVerification(user.id);
  } catch {
    return NextResponse.json(
      { verification: { status: "FAILED", executionId: null, message: "Controlled verification failed safely." } },
      { status: 500 },
    );
  }
  const status =
    result.status === "SUCCEEDED" ? 200 :
    result.status === "DISABLED" ? 403 :
    result.status === "UNAUTHORIZED" ? 403 :
    result.status === "NOT_CONFIGURED" ? 503 : 400;
  return NextResponse.json({ verification: result }, { status });
}
