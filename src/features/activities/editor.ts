import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_INSTRUCTIONS_MAX_LENGTH,
  ACTIVITY_TITLE_MAX_LENGTH,
  CHECKPOINT_INSTRUCTIONS_MAX_LENGTH,
  MAX_CHECKPOINTS,
  activityDraftSchema,
  type ActivityDraft,
  type ActivityVersion,
} from "./contracts";
import { lineStringSchema, parseGeoJsonText, polygonSchema } from "./geojson";

export interface CheckpointFormValues {
  title: string;
  instructions: string;
  latitude: string;
  longitude: string;
  radiusM: string;
}

/** Editor form state: geometry stays as editable text until it is saved. */
export interface ActivityEditorValues {
  title: string;
  description: string;
  instructions: string;
  boundaryText: string;
  routeText: string;
  checkpoints: CheckpointFormValues[];
}

export type EditorFieldErrors = Record<string, string>;

export const EMPTY_CHECKPOINT: CheckpointFormValues = {
  title: "",
  instructions: "",
  latitude: "",
  longitude: "",
  radiusM: "20",
};

export function editorValuesFromDraft(
  draft: ActivityDraft,
): ActivityEditorValues {
  return {
    title: draft.title,
    description: draft.description ?? "",
    instructions: draft.instructions ?? "",
    boundaryText: draft.geometry.boundary
      ? JSON.stringify(draft.geometry.boundary, null, 2)
      : "",
    routeText: draft.geometry.route
      ? JSON.stringify(draft.geometry.route, null, 2)
      : "",
    checkpoints: [...draft.geometry.checkpoints]
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((checkpoint) => ({
        title: checkpoint.title,
        instructions: checkpoint.instructions ?? "",
        latitude: String(checkpoint.location.coordinates[1]),
        longitude: String(checkpoint.location.coordinates[0]),
        radiusM: String(checkpoint.radiusM),
      })),
  };
}

function numberIn(value: string, min: number, max: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

/**
 * Converts editor text into the save contract, returning Thai messages keyed
 * by form field path. The server revalidates everything, including PostGIS
 * validity that the browser cannot check.
 */
export function draftFromEditorValues(
  values: ActivityEditorValues,
):
  | { data: ActivityDraft; errors?: never }
  | { data?: never; errors: EditorFieldErrors } {
  const errors: EditorFieldErrors = {};

  const title = values.title.trim();
  if (!title) errors.title = "กรอกชื่อกิจกรรม";
  else if (title.length > ACTIVITY_TITLE_MAX_LENGTH) {
    errors.title = `ชื่อกิจกรรมยาวได้ไม่เกิน ${ACTIVITY_TITLE_MAX_LENGTH} ตัวอักษร`;
  }
  if (values.description.trim().length > ACTIVITY_DESCRIPTION_MAX_LENGTH) {
    errors.description = `คำอธิบายยาวได้ไม่เกิน ${ACTIVITY_DESCRIPTION_MAX_LENGTH} ตัวอักษร`;
  }
  if (values.instructions.trim().length > ACTIVITY_INSTRUCTIONS_MAX_LENGTH) {
    errors.instructions = `คำแนะนำยาวได้ไม่เกิน ${ACTIVITY_INSTRUCTIONS_MAX_LENGTH} ตัวอักษร`;
  }

  let boundary = null;
  if (values.boundaryText.trim()) {
    const parsed = parseGeoJsonText(
      values.boundaryText,
      polygonSchema,
      "Polygon",
    );
    if (parsed.error) errors.boundaryText = parsed.error;
    else boundary = parsed.data;
  }

  let route = null;
  if (values.routeText.trim()) {
    const parsed = parseGeoJsonText(
      values.routeText,
      lineStringSchema,
      "LineString",
    );
    if (parsed.error) errors.routeText = parsed.error;
    else route = parsed.data;
  }

  if (values.checkpoints.length > MAX_CHECKPOINTS) {
    errors.checkpoints = `เพิ่มจุดตรวจได้ไม่เกิน ${MAX_CHECKPOINTS} จุด`;
  }

  const checkpoints = values.checkpoints.map((checkpoint, index) => {
    const prefix = `checkpoints.${index}`;
    const latitude = numberIn(checkpoint.latitude, -90, 90);
    const longitude = numberIn(checkpoint.longitude, -180, 180);
    const radius = checkpoint.radiusM.trim()
      ? numberIn(checkpoint.radiusM, Number.MIN_VALUE, 500)
      : 20;
    const checkpointTitle = checkpoint.title.trim();

    if (!checkpointTitle) errors[`${prefix}.title`] = "กรอกชื่อจุดตรวจ";
    else if (checkpointTitle.length > ACTIVITY_TITLE_MAX_LENGTH) {
      errors[`${prefix}.title`] =
        `ชื่อจุดตรวจยาวได้ไม่เกิน ${ACTIVITY_TITLE_MAX_LENGTH} ตัวอักษร`;
    }
    if (
      checkpoint.instructions.trim().length > CHECKPOINT_INSTRUCTIONS_MAX_LENGTH
    ) {
      errors[`${prefix}.instructions`] =
        `คำแนะนำยาวได้ไม่เกิน ${CHECKPOINT_INSTRUCTIONS_MAX_LENGTH} ตัวอักษร`;
    }
    if (latitude === null) {
      errors[`${prefix}.latitude`] = "ละติจูดต้องเป็นตัวเลขระหว่าง -90 ถึง 90";
    }
    if (longitude === null) {
      errors[`${prefix}.longitude`] =
        "ลองจิจูดต้องเป็นตัวเลขระหว่าง -180 ถึง 180";
    }
    if (radius === null) {
      errors[`${prefix}.radiusM`] = "รัศมีต้องมากกว่า 0 และไม่เกิน 500 เมตร";
    }

    return {
      sequenceNumber: index + 1,
      title: checkpointTitle,
      instructions: checkpoint.instructions,
      location: {
        type: "Point" as const,
        coordinates: [longitude ?? 0, latitude ?? 0],
      },
      radiusM: radius ?? 20,
    };
  });

  if (Object.keys(errors).length) return { errors };

  const parsed = activityDraftSchema.safeParse({
    title,
    description: values.description,
    instructions: values.instructions,
    geometry: { boundary, route, checkpoints },
    plugin: { key: "plant_survey", schemaVersion: 1, config: {} },
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "form"] ??= "ข้อมูลกิจกรรมไม่ถูกต้อง";
    }
    return { errors };
  }
  return { data: parsed.data };
}

export interface ReadinessItem {
  key: "boundary" | "route" | "checkpoints";
  label: string;
  done: boolean;
}

/** Publish checklist from the saved version; the server enforces containment. */
export function publishReadiness(
  version: ActivityVersion | null,
): ReadinessItem[] {
  const checkpointCount = version?.geometry.checkpoints.length ?? 0;
  return [
    {
      key: "boundary",
      label: "ขอบเขตสำรวจ",
      done: Boolean(version?.geometry.boundary),
    },
    { key: "route", label: "เส้นทาง", done: Boolean(version?.geometry.route) },
    {
      key: "checkpoints",
      label: checkpointCount
        ? `จุดตรวจ ${checkpointCount} จุด`
        : "จุดตรวจอย่างน้อย 1 จุด",
      done: checkpointCount > 0,
    },
  ];
}

export function formatArea(areaM2: number | null) {
  if (areaM2 === null) return "—";
  const rai = areaM2 / 1600;
  return rai >= 0.01
    ? `${rai.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ไร่`
    : `${Math.round(areaM2).toLocaleString("th-TH")} ตร.ม.`;
}

export function formatDistance(lengthM: number | null) {
  if (lengthM === null) return "—";
  return lengthM >= 1000
    ? `${(lengthM / 1000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} กม.`
    : `${Math.round(lengthM).toLocaleString("th-TH")} ม.`;
}
