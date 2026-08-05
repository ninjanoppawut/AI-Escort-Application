import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apiEnvelopeSchema,
  errorEnvelope,
  successEnvelope,
} from "@/lib/http/envelope";

const requestId = "3d6f0a68-dce9-49b1-a4f4-c64af0f90f7b";

describe("API envelope", () => {
  const schema = apiEnvelopeSchema(z.object({ status: z.string() }));

  it("validates a success response", () => {
    const envelope = successEnvelope({ status: "ready" }, requestId);

    expect(schema.parse(envelope)).toEqual(envelope);
  });

  it("validates a stable safe error response", () => {
    const envelope = errorEnvelope(
      {
        code: "CONFIGURATION_INVALID",
        message: "Configuration is incomplete.",
        retryable: false,
        details: { fields: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] },
      },
      requestId,
    );

    expect(schema.parse(envelope)).toEqual(envelope);
  });
});
