import { describe, expect, it } from "vitest";

import { activityDraftSchema } from "./contracts";
import {
  draftFromEditorValues,
  editorValuesFromDraft,
  formatArea,
  formatDistance,
  publishReadiness,
  type ActivityEditorValues,
} from "./editor";

const square = {
  type: "Polygon",
  coordinates: [
    [
      [100.5, 13.75],
      [100.51, 13.75],
      [100.51, 13.76],
      [100.5, 13.76],
      [100.5, 13.75],
    ],
  ],
};

const values: ActivityEditorValues = {
  title: "Garden survey",
  description: "",
  instructions: "Stay inside the boundary.",
  boundaryText: JSON.stringify({ type: "Feature", geometry: square }),
  routeText: "",
  checkpoints: [
    {
      title: "Start",
      instructions: "",
      latitude: "13.755",
      longitude: "100.505",
      radiusM: "",
    },
  ],
};

describe("activity editor conversion", () => {
  it("converts editor text into the save contract", () => {
    const result = draftFromEditorValues(values);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      title: "Garden survey",
      description: null,
      instructions: "Stay inside the boundary.",
      geometry: {
        boundary: square,
        route: null,
        checkpoints: [
          {
            sequenceNumber: 1,
            title: "Start",
            instructions: null,
            location: { type: "Point", coordinates: [100.505, 13.755] },
            radiusM: 20,
          },
        ],
      },
      plugin: { key: "plant_survey", schemaVersion: 1, config: {} },
    });
  });

  it("reports Thai errors keyed by form path", () => {
    const result = draftFromEditorValues({
      ...values,
      title: " ",
      routeText: "{",
      checkpoints: [
        {
          title: "",
          instructions: "",
          latitude: "95",
          longitude: "x",
          radiusM: "900",
        },
      ],
    });
    expect(result.errors).toEqual({
      title: "กรอกชื่อกิจกรรม",
      routeText: "ไม่ใช่ GeoJSON ที่อ่านได้ ตรวจวงเล็บและเครื่องหมายจุลภาค",
      "checkpoints.0.title": "กรอกชื่อจุดตรวจ",
      "checkpoints.0.latitude": "ละติจูดต้องเป็นตัวเลขระหว่าง -90 ถึง 90",
      "checkpoints.0.longitude": "ลองจิจูดต้องเป็นตัวเลขระหว่าง -180 ถึง 180",
      "checkpoints.0.radiusM": "รัศมีต้องมากกว่า 0 และไม่เกิน 500 เมตร",
    });
  });

  it("round-trips a saved draft back into editor values", () => {
    const draft = activityDraftSchema.parse({
      title: "Garden survey",
      geometry: {
        boundary: square,
        checkpoints: [
          {
            sequenceNumber: 2,
            title: "End",
            location: { type: "Point", coordinates: [100.506, 13.756] },
          },
          {
            sequenceNumber: 1,
            title: "Start",
            location: { type: "Point", coordinates: [100.505, 13.755] },
          },
        ],
      },
    });
    const editorValues = editorValuesFromDraft(draft);
    expect(
      editorValues.checkpoints.map((checkpoint) => checkpoint.title),
    ).toEqual(["Start", "End"]);
    expect(draftFromEditorValues(editorValues).data?.geometry.boundary).toEqual(
      square,
    );
  });
});

describe("publish readiness and summaries", () => {
  it("lists missing geometry from the saved version", () => {
    expect(publishReadiness(null).map((item) => item.done)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("formats area in rai and distance in metres or kilometres", () => {
    expect(formatArea(16_000)).toBe("10 ไร่");
    expect(formatArea(8)).toBe("8 ตร.ม.");
    expect(formatDistance(850)).toBe("850 ม.");
    expect(formatDistance(1_250)).toBe("1.25 กม.");
    expect(formatDistance(null)).toBe("—");
  });
});
