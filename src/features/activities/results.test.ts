import { describe, expect, it } from "vitest";

import {
  activityDraftSchema,
  createActivityRequestSchema,
  draftFromDetail,
  editableVersionNumber,
  type ActivityDetail,
} from "./contracts";
import { publishBlockMessage } from "./errors";
import {
  buildSaveActivityArgs,
  interpretPublishActivityRow,
  interpretSaveActivityRow,
} from "./results";

const activityId = "60000000-0000-4000-8000-000000006301";
const versionId = "61000000-0000-4000-8000-000000006301";
const classId = "20000000-0000-4000-8000-000000006301";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type SaveRow = Parameters<typeof interpretSaveActivityRow>[0];
type PublishRow = Parameters<typeof interpretPublishActivityRow>[0];

describe("activity request contracts", () => {
  it("applies defaults and rejects duplicate checkpoint order", () => {
    const draft = activityDraftSchema.parse({ title: " Garden survey " });
    expect(draft).toEqual({
      title: "Garden survey",
      description: null,
      instructions: null,
      geometry: { boundary: null, route: null, checkpoints: [] },
      plugin: { key: "plant_survey", schemaVersion: 1, config: {} },
    });
    const point = { type: "Point", coordinates: [100.5, 13.75] };
    expect(
      activityDraftSchema.safeParse({
        title: "Garden survey",
        geometry: {
          checkpoints: [
            { sequenceNumber: 1, title: "A", location: point },
            { sequenceNumber: 1, title: "B", location: point },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("requires a class on create and rejects unknown keys", () => {
    expect(
      createActivityRequestSchema.safeParse({ title: "Garden survey" }).success,
    ).toBe(false);
    expect(
      createActivityRequestSchema.safeParse({
        classId,
        title: "Garden survey",
        status: "published",
      }).success,
    ).toBe(false);
  });

  it("builds RPC args without sending absent identifiers", () => {
    const draft = activityDraftSchema.parse({ title: "Garden survey" });
    expect(buildSaveActivityArgs({ draft, classId })).toEqual({
      draft,
      target_class_id: classId,
    });
    expect(
      buildSaveActivityArgs({ draft, activityId, expectedVersion: 2 }),
    ).toEqual({
      draft,
      target_activity_id: activityId,
      expected_version_number: 2,
    });
  });
});

describe("activity RPC interpretation", () => {
  it("maps saves, denials, and publish outcomes", () => {
    expect(
      interpretSaveActivityRow(
        row<SaveRow>({
          outcome: "created",
          error_code: null,
          activity_id: activityId,
          activity_version_id: versionId,
          version_number: 1,
          error_details: null,
        }),
      ).data,
    ).toEqual({
      outcome: "created",
      activityId,
      activityVersionId: versionId,
      versionNumber: 1,
    });

    const conflict = interpretSaveActivityRow(
      row<SaveRow>({
        outcome: "denied",
        error_code: "ACTIVITY_VERSION_CONFLICT",
        activity_id: activityId,
        activity_version_id: versionId,
        version_number: 3,
        error_details: { currentVersionNumber: 3, currentStatus: "draft" },
      }),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.error?.details).toEqual({
      currentVersionNumber: 3,
      currentStatus: "draft",
    });

    const blocked = interpretPublishActivityRow(
      row<PublishRow>({
        outcome: "denied",
        error_code: "ACTIVITY_GEOMETRY_INVALID",
        activity_id: activityId,
        activity_version_id: versionId,
        version_number: 1,
        error_details: {
          reason: "checkpoint_outside_boundary",
          sequenceNumber: 2,
        },
      }),
    );
    expect(blocked.status).toBe(422);
    expect(publishBlockMessage(blocked.error!.details)).toBe(
      "จุดตรวจที่ 2 อยู่นอกขอบเขตสำรวจ",
    );
    expect(
      interpretPublishActivityRow(
        row<PublishRow>({
          outcome: "denied",
          error_code: "UNEXPECTED",
          activity_id: activityId,
          activity_version_id: null,
          version_number: null,
          error_details: null,
        }),
      ).error?.code,
    ).toBe("FORBIDDEN");
  });
});

describe("editor helpers", () => {
  const version = {
    id: versionId,
    versionNumber: 2,
    title: "Garden survey",
    instructions: "Stay inside",
    status: "published" as const,
    publishedAt: "2026-09-12T02:00:00+00:00",
    updatedAt: "2026-09-12T02:00:00+00:00",
    geometry: {
      boundary: null,
      route: null,
      checkpoints: [
        {
          sequenceNumber: 1,
          title: "Start",
          instructions: null,
          location: {
            type: "Point" as const,
            coordinates: [100.5, 13.75] as const,
          },
          radiusM: 20,
        },
      ],
    },
    plugin: null,
    summary: { boundaryAreaM2: null, routeLengthM: null, checkpointCount: 1 },
  };
  const detail: ActivityDetail = {
    activity: {
      id: activityId,
      classId,
      className: "Biology",
      title: "Garden survey",
      description: null,
      status: "published",
      updatedAt: "2026-09-12T02:00:00+00:00",
    },
    viewerRole: "teacher",
    published: version,
    draft: null,
    refreshedAt: "2026-09-12T02:00:00+00:00",
  };

  it("edits from the draft when present, otherwise the published version", () => {
    expect(editableVersionNumber(detail)).toBe(2);
    expect(draftFromDetail(detail).geometry.checkpoints[0]?.title).toBe(
      "Start",
    );
    expect(
      editableVersionNumber({
        ...detail,
        draft: { ...version, versionNumber: 3, status: "draft" },
      }),
    ).toBe(3);
  });
});
