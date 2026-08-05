import type { RequestContext } from "@/lib/http/request-context";

export interface TelemetryContext extends RequestContext {
  environment: "local" | "preview" | "staging" | "production";
  release: string;
}

export interface TelemetryMetadata {
  environment: TelemetryContext["environment"];
  release: string;
}

export function createTelemetryContext(
  request: RequestContext,
  metadata: TelemetryMetadata,
): TelemetryContext {
  return {
    ...request,
    environment: metadata.environment,
    release: metadata.release,
  };
}
