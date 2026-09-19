import {
  EXPORT_V1_COLUMNS,
  type ExportRow,
  type ExportType,
} from "./contracts";

// Stable export-v1 file formats (D-069). Pure so the server writes the same
// bytes for the same rows.

export const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Cells a spreadsheet would run as a formula start with these characters. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | number | boolean | null) {
  if (value === null) return "";
  let text = String(value);
  // Neutralize spreadsheet formula injection in free text (OWASP CSV).
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 BOM so spreadsheets read Thai text correctly. */
export function toCsv(rows: readonly ExportRow[]) {
  const lines = [
    EXPORT_V1_COLUMNS.join(","),
    ...rows.map((row) =>
      EXPORT_V1_COLUMNS.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}

/**
 * A GeoJSON FeatureCollection at capture locations. Records without a fix
 * keep a null geometry rather than an invented point (D-020, D-051).
 */
export function toGeoJson(rows: readonly ExportRow[]) {
  return JSON.stringify({
    type: "FeatureCollection",
    schema_version: "export-v1",
    features: rows.map((row) => {
      const { latitude, longitude, ...properties } = row;
      return {
        type: "Feature",
        geometry:
          typeof latitude === "number" && typeof longitude === "number"
            ? { type: "Point", coordinates: [longitude, latitude] }
            : null,
        properties,
      };
    }),
  });
}

export function exportFile(type: ExportType, rows: readonly ExportRow[]) {
  return type === "geojson"
    ? { body: toGeoJson(rows), contentType: "application/geo+json" }
    : { body: toCsv(rows), contentType: "text/csv" };
}

export function exportFileName(
  type: ExportType,
  sessionTitle: string | null,
  exportId: string,
) {
  const safe = (sessionTitle ?? "session")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${safe || "session"}-${exportId.slice(0, 8)}.${type === "geojson" ? "geojson" : "csv"}`;
}
