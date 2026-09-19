import { NextResponse } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { getBrowserEnvironment } from "@/lib/env/browser";
import { clientErrorReportSchema } from "@/lib/telemetry/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function releaseVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 12) : null;
}

// Redacted browser failure intake (P15-03; owner question 59: direct
// Storage upload failures never reach the server otherwise). Always answers
// 204 so a report can never become a user-visible failure.
export async function POST(request: Request) {
  const done = new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
  if (!hasSafeRequestOrigin(request)) return done;
  const body = clientErrorReportSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return done;

  try {
    const supabase = await createSupabaseServerClient();
    const report = body.data;
    await supabase.rpc("record_operational_error", {
      error_flow: report.flow,
      error_stage: report.stage,
      code: report.code,
      error_severity: report.severity,
      error_environment: getBrowserEnvironment().NEXT_PUBLIC_APP_ENV,
      error_source: "client",
      ...(releaseVersion() ? { release: releaseVersion()! } : {}),
      ...(report.requestId ? { correlation_request_id: report.requestId } : {}),
      context: report.context ?? {},
      ...(report.occurredAt ? { occurred: report.occurredAt } : {}),
    });
  } catch {
    // Telemetry is best effort.
  }
  return done;
}
