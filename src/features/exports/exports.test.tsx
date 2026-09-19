import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExportStatusScreen } from "./components/export-status-screen";
import {
  EXPORT_V1_COLUMNS,
  exportRequestSchema,
  exportViewSchema,
  type ExportRow,
} from "./contracts";
import { BYTE_ORDER_MARK, exportFileName, toCsv, toGeoJson } from "./format";

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    schema_version: "export-v1",
    observation_id: "81000000-0000-4000-8000-000000008671",
    status: "verified",
    submission_number: 1,
    submitted_at: "2026-09-19T02:30:00+00:00",
    captured_at: "2026-09-19T02:00:00+00:00",
    location_status: "captured",
    latitude: 13.7551,
    longitude: 100.5051,
    accuracy_m: 8,
    location_source: "capture",
    student_common_name: "ชบา",
    student_scientific_name: "Hibiscus rosa-sinensis",
    identity_source: "manual",
    evidence_note: 'ดอกแดง, กลีบ 5 กลีบ\n"เกสรยาว"',
    verified_common_name: "พู่ระหง",
    verified_scientific_name: "Hibiscus schizopetalus",
    review_decision: "verified",
    reviewed_at: "2026-09-19T03:00:00+00:00",
    same_species_in_session: false,
    recorder_name: "Ada Leader",
    group_name: "Leaf",
    image_count: 2,
    ...overrides,
  };
}

describe("export-v1 formats", () => {
  it("writes RFC 4180 CSV with a BOM, the stable header, and quoting", () => {
    const csv = toCsv([row()]);
    expect(csv.startsWith(BYTE_ORDER_MARK)).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header).toBe(EXPORT_V1_COLUMNS.join(","));
    expect(line).toContain('"ดอกแดง, กลีบ 5 กลีบ\n""เกสรยาว"""');
    expect(line).toContain(",13.7551,100.5051,8,capture,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("neutralizes spreadsheet formulas in free text", () => {
    const csv = toCsv([
      row({ evidence_note: '=HYPERLINK("x")', recorder_name: "+cmd" }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",'+cmd,");
    expect(toCsv([row({ latitude: -1.5 })])).toContain(",-1.5,");
  });

  it("writes GeoJSON points at capture locations and null geometry without a fix", () => {
    const parsed = JSON.parse(
      toGeoJson([
        row(),
        row({
          latitude: null,
          longitude: null,
          location_status: "unavailable",
        }),
      ]),
    ) as {
      type: string;
      schema_version: string;
      features: Array<{
        geometry: unknown;
        properties: Record<string, unknown>;
      }>;
    };
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.schema_version).toBe("export-v1");
    expect(parsed.features[0]!.geometry).toEqual({
      type: "Point",
      coordinates: [100.5051, 13.7551],
    });
    expect(parsed.features[1]!.geometry).toBeNull();
    expect(parsed.features[0]!.properties).not.toHaveProperty("latitude");
  });

  it("names files safely and validates requests strictly", () => {
    expect(
      exportFileName(
        "csv",
        "Morning round / สวน",
        "e0000000-0000-4000-8000-000000000001",
      ),
    ).toBe("Morning-round-สวน-e0000000.csv");
    expect(
      exportRequestSchema.safeParse({
        classId: "20000000-0000-4000-8000-000000008671",
        sessionId: "62000000-0000-4000-8000-000000008671",
        type: "research_csv",
      }).success,
    ).toBe(false);
    expect(
      exportRequestSchema.safeParse({
        classId: "20000000-0000-4000-8000-000000008671",
        sessionId: "62000000-0000-4000-8000-000000008671",
        type: "csv",
        filters: { statuses: ["draft"] },
      }).success,
    ).toBe(false);
  });
});

function view(status: string) {
  return exportViewSchema.parse({
    id: "e0000000-0000-4000-8000-000000008671",
    classId: "20000000-0000-4000-8000-000000008671",
    sessionId: "62000000-0000-4000-8000-000000008671",
    sessionTitle: "Morning round",
    type: "csv",
    schemaVersion: "export-v1",
    status,
    filters: {},
    rowCount: status === "ready" ? 3 : null,
    byteSize: null,
    failureCode: null,
    createdAt: "2026-09-19T05:00:00+00:00",
    completedAt: null,
    expiresAt: "2026-09-26T05:00:00+00:00",
    refreshedAt: "2026-09-19T05:00:00+00:00",
  });
}

function renderStatus(status: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExportStatusScreen
        exportId="e0000000-0000-4000-8000-000000008671"
        initialErrorCode={null}
        initialExport={view(status)}
      />
    </QueryClientProvider>,
  );
}

describe("ExportStatusScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a queued export once and then offers the download", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: view("ready"),
            error: null,
            requestId: "90000000-0000-4000-8000-000000008671",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    renderStatus("queued");

    await waitFor(() =>
      expect(document.querySelector("[data-export-status]")).toHaveAttribute(
        "data-export-status",
        "ready",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "ดาวน์โหลด" })).toHaveAttribute(
      "href",
      "/api/exports/e0000000-0000-4000-8000-000000008671/download",
    );
  });

  it("explains expired and refused exports without a download", () => {
    const { unmount } = renderStatus("expired");
    expect(screen.getByText(/ไฟล์นี้หมดอายุแล้ว/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "ดาวน์โหลด" })).toBeNull();
    unmount();

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ExportStatusScreen
          exportId="e0000000-0000-4000-8000-000000008671"
          initialErrorCode="FORBIDDEN"
          initialExport={null}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "คุณไม่มีสิทธิ์ทำรายการนี้",
    );
  });
});
