import { describe, expect, it } from "vitest";

import { createRequestContext } from "@/lib/http/request-context";

describe("request context", () => {
  it("preserves valid caller correlation IDs", () => {
    const headers = new Headers({
      "x-request-id": "42c6f16f-f402-4da2-9f00-5ff0d97c135c",
      "x-trace-id": "70945327-76c1-49e9-b872-a59517d9943b",
    });

    expect(createRequestContext(headers)).toEqual({
      requestId: "42c6f16f-f402-4da2-9f00-5ff0d97c135c",
      traceId: "70945327-76c1-49e9-b872-a59517d9943b",
    });
  });

  it("replaces invalid identifiers and correlates the trace", () => {
    const context = createRequestContext(
      new Headers({ "x-request-id": "unsafe value" }),
    );

    expect(context.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(context.traceId).toBe(context.requestId);
  });
});
