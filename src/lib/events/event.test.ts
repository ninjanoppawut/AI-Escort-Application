import { describe, expect, it } from "vitest";

import { researchEventNameSchema } from "@/lib/events/event";

describe("research event registry", () => {
  it("accepts registered events and rejects invented names", () => {
    expect(researchEventNameSchema.parse("group_created")).toBe(
      "group_created",
    );
    expect(() =>
      researchEventNameSchema.parse("student_location_raw"),
    ).toThrow();
  });
});
