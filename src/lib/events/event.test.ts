import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RESEARCH_EVENT_REGISTRY,
  registeredPayload,
  researchEventNameSchema,
} from "@/lib/events/event";

function dictionaryRows() {
  const doc = readFileSync(
    join(process.cwd(), "docs/RESEARCH_EVENT_DICTIONARY.md"),
    "utf8",
  );
  return [...doc.matchAll(/^\| `([a-z_]+)` \| [^|]+ \| ([^|]+) \|/gm)].map(
    ([, name, keys]) => ({
      name: name!,
      keys: [...keys!.matchAll(/`([a-z_]+)`/g)].map(([, key]) => key!),
    }),
  );
}

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260919190000_phase14_event_registry.sql",
);

describe("research event registry", () => {
  it("accepts registered events and rejects invented names", () => {
    expect(researchEventNameSchema.parse("group_created")).toBe(
      "group_created",
    );
    expect(researchEventNameSchema.parse("class_created")).toBe(
      "class_created",
    );
    expect(() =>
      researchEventNameSchema.parse("student_location_raw"),
    ).toThrow();
  });

  it("matches the dictionary event list and payload keys", () => {
    const rows = dictionaryRows();
    expect(rows.length).toBeGreaterThan(40);
    expect(Object.keys(RESEARCH_EVENT_REGISTRY)).toEqual(
      rows.map((row) => row.name),
    );
    for (const row of rows) {
      const keys: readonly string[] =
        RESEARCH_EVENT_REGISTRY[
          row.name as keyof typeof RESEARCH_EVENT_REGISTRY
        ];
      expect(keys.filter((key) => key !== "offline_delay_s")).toEqual(row.keys);
    }
  });

  it("matches the database registry seeded by the migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const seeded = Object.fromEntries(
      [...sql.matchAll(/\('([a-z_]+)', 1, array\[([^\]]*)\]/g)].map(
        ([, name, keys]) => [
          name!,
          [...keys!.matchAll(/'([a-z_]+)'/g)].map(([, key]) => key!),
        ],
      ),
    );
    expect(seeded).toEqual(
      Object.fromEntries(
        Object.entries(RESEARCH_EVENT_REGISTRY).map(([name, keys]) => [
          name,
          [...keys],
        ]),
      ),
    );
  });

  it("drops unregistered payload keys", () => {
    expect(
      registeredPayload("observation_started", {
        location_status: "captured",
        offline_delay_s: 30,
        email: "student@example.edu",
        lat: 13.7,
      }),
    ).toEqual({ location_status: "captured", offline_delay_s: 30 });
  });
});
