import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchObservationJson } from "../../client/request";
import {
  observationDraftSchema,
  observationQueryKeys,
  type ObservationDraft,
} from "../../contracts";
import {
  EVIDENCE_NOTE_MIN_CHARS,
  isUnknownPlantName,
  reviewStateSchema,
  type ReviewState,
  type SubmitBlocker,
} from "../contracts";
import { OBSERVATION_ERROR_PRESENTATIONS } from "../../errors";
import { PlantReviewSection } from "./plant-review-section";

const observationId = "81000000-0000-4000-8000-000000008611";
const sessionId = "62000000-0000-4000-8000-000000008611";
const classId = "20000000-0000-4000-8000-000000008611";
const activityId = "60000000-0000-4000-8000-000000008611";
const requestId = "90000000-0000-4000-8000-000000008611";
const submissionId = "83000000-0000-4000-8000-000000008611";

const EVIDENCE = "ขอบใบเรียบช่วงโคน หยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง";

interface Trait {
  traitKey: string;
  status: string | null;
  value: string | null;
  note: string | null;
}

/** An in-memory owner API with the server's version and readiness rules. */
class FakeServer {
  status = "draft";
  version = 2;
  identitySource: "manual" | null = null;
  commonName: string | null = "ชบา";
  scientificName: string | null = null;
  evidenceNote: string | null = null;
  referenceNote: string | null = null;
  traits: Trait[] = [];
  wholePlantImage = true;
  /** Other submitted records of this taxon in the session. */
  sameSpeciesCount = 0;
  /** A match /related does not show yet (a concurrent classmate submit). */
  unseenSameSpecies = 0;
  relatedReads = 0;
  canSubmit = true;
  submitBlockedCode: string | null = null;
  submission: ReviewState["submission"] = null;
  saves: Record<string, unknown>[] = [];
  submits: Record<string, unknown>[] = [];
  /** Returns a transport failure (or a response) instead of handling. */
  failNextSubmit: "network" | null = null;
  submittedKeys = new Map<string, number>();

  blockers(): SubmitBlocker[] {
    const blockers: SubmitBlocker[] = [];
    if (this.status === "draft" || !this.identitySource) {
      blockers.push("student_review");
    }
    if (isUnknownPlantName(this.commonName)) blockers.push("common_name");
    if (isUnknownPlantName(this.scientificName))
      blockers.push("scientific_name");
    if ((this.evidenceNote?.trim().length ?? 0) < EVIDENCE_NOTE_MIN_CHARS) {
      blockers.push("evidence_note");
    }
    if (!this.wholePlantImage) blockers.push("whole_plant_image");
    return blockers;
  }

  draft(): ObservationDraft {
    const editable =
      this.status === "draft" || this.status === "student_review";
    return observationDraftSchema.parse({
      id: observationId,
      clientGeneratedId: "82000000-0000-4000-8000-000000008611",
      status: this.status,
      version: this.version,
      capture: {
        locationStatus: "captured",
        lat: 13.7551,
        lng: 100.5051,
        accuracyM: 8,
        capturedAt: "2026-09-19T02:00:00+00:00",
        unavailableReason: null,
      },
      draft: {
        commonName: this.commonName,
        scientificName: this.scientificName,
        evidenceNote: this.evidenceNote,
      },
      session: {
        id: sessionId,
        classId,
        title: "Morning round",
        status: "open",
      },
      activity: { id: activityId, title: "Garden survey" },
      groupStatus: "active",
      permissions: editable
        ? { canEdit: true, blockedCode: null, blockedReason: null }
        : {
            canEdit: false,
            blockedCode: "INVALID_STATUS_TRANSITION",
            blockedReason: "submitted",
          },
      createdAt: "2026-09-19T02:00:00+00:00",
      updatedAt: "2026-09-19T02:00:00+00:00",
      refreshedAt: "2026-09-19T02:10:00+00:00",
    });
  }

  review(): ReviewState {
    const editable =
      this.status === "draft" || this.status === "student_review";
    return reviewStateSchema.parse({
      observationId,
      status: this.status,
      version: this.version,
      identitySource: this.identitySource,
      referenceNote: this.referenceNote,
      analysis: { state: "unavailable" },
      traits: this.traits,
      readiness: {
        blockers: this.blockers(),
        evidenceNoteMinChars: EVIDENCE_NOTE_MIN_CHARS,
      },
      // The observation columns are written at submit, as in SQL.
      sameSpecies: {
        inSession: (this.submission?.sameSpeciesCount ?? 0) > 0,
        count: this.submission?.sameSpeciesCount ?? 0,
      },
      submission: this.submission,
      permissions: {
        canEdit: editable,
        canSubmit: editable && this.canSubmit && this.blockers().length === 0,
        submitBlockedCode: editable
          ? this.submitBlockedCode
          : "INVALID_STATUS_TRANSITION",
        submitBlockedReason: null,
      },
      refreshedAt: "2026-09-19T02:10:00+00:00",
    });
  }

  related() {
    this.relatedReads += 1;
    return envelope({
      basis: this.submission ? "submitted" : "draft",
      sameSpeciesInSession: this.sameSpeciesCount > 0,
      sameSpeciesCount: this.sameSpeciesCount,
      possibleSameSpecimenCount: this.sameSpeciesCount > 0 ? 1 : 0,
      visibility: "restricted",
      refreshedAt: "2026-09-19T02:10:00+00:00",
    });
  }

  save(body: Record<string, unknown>) {
    this.saves.push(body);
    if (body.expectedVersion !== this.version) {
      return errorEnvelope("OBSERVATION_VERSION_CONFLICT", 409, {
        currentVersion: this.version,
        observation: this.draft(),
      });
    }
    this.commonName = body.commonName as string | null;
    this.scientificName = body.scientificName as string | null;
    this.evidenceNote = body.evidenceNote as string | null;
    this.referenceNote = body.referenceNote as string | null;
    this.traits = (body.traits as Record<string, string | null>[]).map(
      (trait) => ({
        traitKey: trait.traitKey!,
        status: trait.status ?? null,
        value: trait.value ?? null,
        note: trait.note ?? null,
      }),
    );
    this.identitySource = "manual";
    this.status = "student_review";
    this.version += 1;
    return envelope({
      outcome: "updated",
      version: this.version,
      status: this.status,
    });
  }

  submit(body: Record<string, unknown>) {
    this.submits.push(body);
    const key = body.clientSubmissionId as string;
    if (this.submittedKeys.has(key)) {
      return envelope({
        outcome: "existing",
        submissionId,
        submissionNumber: 1,
        version: this.submittedKeys.get(key),
      });
    }
    if (this.unseenSameSpecies > 0) {
      this.sameSpeciesCount += this.unseenSameSpecies;
      this.unseenSameSpecies = 0;
    }
    if (this.sameSpeciesCount > 0 && body.acknowledgeSameSpecies !== true) {
      return errorEnvelope("SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED", 409, {
        sameSpeciesCount: this.sameSpeciesCount,
      });
    }
    const blockers = this.blockers();
    if (blockers.length > 0) {
      return errorEnvelope("VALIDATION_FAILED", 422, { blockers });
    }
    this.status = "submitted";
    this.version += 1;
    this.submittedKeys.set(key, this.version);
    this.submission = {
      id: submissionId,
      submissionNumber: 1,
      submittedAt: "2026-09-19T02:30:00+00:00",
      commonName: this.commonName!,
      scientificName: this.scientificName!,
      evidenceNote: this.evidenceNote!,
      imageCount: 2,
      sameSpeciesCount: this.sameSpeciesCount,
      sameSpeciesAcknowledged: this.sameSpeciesCount > 0,
    };
    return envelope(
      {
        outcome: "submitted",
        submissionId,
        submissionNumber: 1,
        version: this.version,
      },
      201,
    );
  }
}

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorEnvelope(
  code: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      data: null,
      error: { code, message: code, retryable: false, details },
      requestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function serve(server: FakeServer, options: { reviewFails?: boolean } = {}) {
  let reviewFails = options.reviewFails ?? false;
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (url === `/api/observations/${observationId}`) {
        return envelope(server.draft());
      }
      if (url === `/api/observations/${observationId}/student-review`) {
        if (init?.method === "PUT") return server.save(body);
        if (reviewFails) throw new TypeError("offline");
        return envelope(server.review());
      }
      if (url === `/api/observations/${observationId}/related`) {
        return server.related();
      }
      if (url === `/api/observations/${observationId}/submit`) {
        if (server.failNextSubmit === "network") {
          server.failNextSubmit = null;
          server.submit(body);
          throw new TypeError("connection lost after commit");
        }
        return server.submit(body);
      }
      throw new Error(`unexpected request ${url}`);
    });
  return {
    fetchMock,
    recoverReview: () => {
      reviewFails = false;
    },
  };
}

function Harness({
  online = true,
  draftNotesDirty = false,
}: {
  online?: boolean;
  draftNotesDirty?: boolean;
}) {
  const draftQuery = useQuery({
    queryKey: observationQueryKeys.detail(observationId),
    queryFn: () =>
      fetchObservationJson(
        `/api/observations/${observationId}`,
        observationDraftSchema,
      ),
  });
  if (!draftQuery.data) return null;
  return (
    <PlantReviewSection
      draft={draftQuery.data}
      draftNotes={<section aria-label="ร่างข้อมูลพืช (P8)">ร่าง</section>}
      draftNotesDirty={draftNotesDirty}
      online={online}
    />
  );
}

function renderSection(props: Parameters<typeof Harness>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function readyServer() {
  const server = new FakeServer();
  server.status = "student_review";
  server.identitySource = "manual";
  server.version = 5;
  server.scientificName = "Hibiscus rosa-sinensis";
  server.evidenceNote = EVIDENCE;
  server.traits = [
    { traitKey: "leaf_margin", status: null, value: "หยักปลายใบ", note: null },
    { traitKey: "bark", status: "not_visible", value: null, note: null },
  ];
  return server;
}

function manualForm() {
  return screen.getByRole("region", { name: "กรอกข้อมูลพืชเอง" });
}

function submitPanel() {
  return screen.getByRole("region", { name: "สรุปก่อนส่ง" });
}

async function openTraitGroup(label: string) {
  const summary = within(manualForm()).getByText(label, { selector: "span" });
  await userEvent.click(summary);
}

describe("PlantReviewSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers manual entry while AI is unavailable and keeps the P8 notes until chosen", async () => {
    const server = new FakeServer();
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", {
      name: "AI ช่วยดูยังไม่เปิดใช้",
    });
    expect(panel).toHaveAttribute("data-analysis-state", "unavailable");
    expect(
      screen.getByRole("region", { name: "ร่างข้อมูลพืช (P8)" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(panel).getByRole("button", { name: "กรอกข้อมูลเอง" }),
    );

    const form = manualForm();
    expect(within(form).getByLabelText(/ชื่อไทยหรือชื่อทั่วไป/)).toHaveValue(
      "ชบา",
    );
    expect(
      screen.queryByRole("region", { name: "ร่างข้อมูลพืช (P8)" }),
    ).not.toBeInTheDocument();
    // Nothing is saved until the student saves; the draft still blocks submit.
    expect(server.saves).toHaveLength(0);
    expect(
      within(submitPanel()).getByText("บันทึกข้อมูลพืชอย่างน้อยหนึ่งครั้ง"),
    ).toBeInTheDocument();
  });

  it("keeps unsaved P8 notes safe by holding manual entry until they are saved", async () => {
    serve(new FakeServer());
    renderSection({ draftNotesDirty: true });

    const button = await screen.findByRole("button", { name: "กรอกข้อมูลเอง" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/บันทึกร่างด้านล่างก่อน แล้วค่อยกรอกข้อมูลเอง/),
    ).toBeInTheDocument();
  });

  it("saves names, trait checks, and evidence with the loaded version", async () => {
    const server = new FakeServer();
    serve(server);
    renderSection();

    await userEvent.click(
      await screen.findByRole("button", { name: "กรอกข้อมูลเอง" }),
    );
    const form = manualForm();
    await userEvent.type(
      within(form).getByLabelText(/ชื่อวิทยาศาสตร์/),
      "Hibiscus rosa-sinensis",
    );

    await openTraitGroup("ใบ");
    const margin = within(form).getByRole("group", { name: "ขอบใบ" });
    await userEvent.click(within(margin).getByLabelText("✓ เห็นชัด"));
    await userEvent.type(
      within(form).getByLabelText("ขอบใบที่เห็นจากต้นจริง"),
      "หยักเฉพาะปลายใบ",
    );
    const venation = within(form).getByRole("group", { name: "เส้นใบ" });
    await userEvent.click(within(venation).getByLabelText("? ไม่แน่ใจ"));

    await userEvent.type(within(form).getByLabelText(/เหตุผลประกอบ/), EVIDENCE);
    expect(
      within(form).getByText(`${EVIDENCE.length} / 20 ขั้นต่ำ`),
    ).toBeInTheDocument();

    await userEvent.click(
      within(form).getByRole("button", { name: "บันทึกข้อมูลพืช" }),
    );

    await waitFor(() => expect(server.saves).toHaveLength(1));
    expect(server.saves[0]).toEqual({
      expectedVersion: 2,
      identitySource: "manual",
      commonName: "ชบา",
      scientificName: "Hibiscus rosa-sinensis",
      evidenceNote: EVIDENCE,
      referenceNote: null,
      traits: [
        { traitKey: "leaf_margin", value: "หยักเฉพาะปลายใบ", note: null },
        { traitKey: "leaf_venation", status: "unsure", note: null },
      ],
    });
    expect(
      await within(manualForm()).findByText(/^บันทึกแล้ว ·/),
    ).toBeInTheDocument();
    expect(
      await within(submitPanel()).findByText("ข้อมูลที่บันทึกไว้ครบ พร้อมส่ง"),
    ).toBeInTheDocument();
    expect(
      within(submitPanel()).getByRole("button", { name: "ส่งการสังเกต" }),
    ).toBeEnabled();
  }, 30_000);

  it("asks for a value when a trait is marked as seen, without saving", async () => {
    const server = readyServer();
    serve(server);
    renderSection();

    await screen.findByRole("region", { name: "กรอกข้อมูลพืชเอง" });
    await openTraitGroup("ดอก");
    const color = within(manualForm()).getByRole("group", { name: "สีดอก" });
    await userEvent.click(within(color).getByLabelText("✓ เห็นชัด"));
    await userEvent.click(
      within(manualForm()).getByRole("button", { name: "บันทึกข้อมูลพืช" }),
    );

    expect(
      await within(manualForm()).findByText(
        /เขียนสิ่งที่เห็นจากต้นจริง หรือเลือก/,
      ),
    ).toBeInTheDocument();
    expect(server.saves).toHaveLength(0);
    // Unsaved edits hold the submit button back.
    expect(
      within(submitPanel()).getByRole("button", { name: "ส่งการสังเกต" }),
    ).toBeDisabled();
    expect(
      within(submitPanel()).getByText(/บันทึกข้อมูลพืชก่อน/),
    ).toBeVisible();
  });

  it("lists what blocks submission and flags an unknown name", async () => {
    const server = readyServer();
    server.scientificName = "ไม่ทราบ";
    server.evidenceNote = "สั้น";
    server.wholePlantImage = false;
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    const blockers = within(panel).getByRole("list", {
      name: "สิ่งที่ต้องทำก่อนส่ง",
    });
    expect(
      within(blockers)
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-blocker")),
    ).toEqual(["scientific_name", "evidence_note", "whole_plant_image"]);
    expect(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    ).toBeDisabled();
    expect(
      within(manualForm()).getByText(/บันทึกได้ แต่ส่งให้ครูไม่ได้/),
    ).toBeInTheDocument();
  });

  it("submits after review-before-submit and shows the frozen submission", async () => {
    const server = readyServer();
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    expect(within(panel).getByText(/✓ เห็นชัด 1/)).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "ส่งการสังเกตนี้ให้ครู?",
    });
    expect(within(dialog).getByText("Hibiscus rosa-sinensis")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "กลับไปตรวจอีกครั้ง" }),
    ).toHaveFocus();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );

    await waitFor(() => expect(server.submits).toHaveLength(1));
    expect(server.submits[0]).toEqual({
      clientSubmissionId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      expectedVersion: 5,
      acknowledgeSameSpecies: false,
    });
    const summary = await screen.findByRole("region", {
      name: "ส่งให้ครูแล้ว",
    });
    expect(summary).toHaveAttribute("data-submission-number", "1");
    expect(within(summary).getByText(/ส่งครั้งที่ 1 เรียบร้อย/)).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "กรอกข้อมูลพืชเอง" }),
    ).not.toBeInTheDocument();
  });

  it("retries a submit whose response was lost with the same client submission ID", async () => {
    const server = readyServer();
    server.failNextSubmit = "network";
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    await userEvent.click(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );
    expect(
      await within(panel).findByText(/ยังไม่รู้ว่าส่งถึงครูหรือไม่/),
    ).toBeVisible();

    await userEvent.click(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );

    await screen.findByRole("region", { name: "ส่งให้ครูแล้ว" });
    expect(server.submits).toHaveLength(2);
    expect(server.submits[1]!.clientSubmissionId).toBe(
      server.submits[0]!.clientSubmissionId,
    );
    expect(server.submission?.submissionNumber).toBe(1);
  });

  it("requires acknowledging a same-species match, then submits with it", async () => {
    const server = readyServer();
    server.sameSpeciesCount = 2;
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    expect(
      await within(panel).findByText(
        /พืชชนิดนี้ถูกบันทึกในรอบนี้แล้ว 2 รายการ/,
      ),
    ).toBeVisible();
    expect(
      within(panel).getByText(/อาจเป็นต้นเดียวกัน 1 รายการ/),
    ).toBeVisible();
    const submit = within(panel).getByRole("button", { name: "ส่งการสังเกต" });
    expect(submit).toBeDisabled();

    await userEvent.click(
      within(panel).getByRole("checkbox", { name: /รับทราบ/ }),
    );
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );

    await screen.findByRole("region", { name: /ส่งให้ครูแล้ว/ });
    expect(server.submits[0]).toMatchObject({ acknowledgeSameSpecies: true });
    expect(
      screen.getByText("ชนิดเดียวกันในรอบนี้ (รับทราบแล้ว)"),
    ).toBeVisible();
  });

  it("shows the warning a refused submit reports and submits once acknowledged", async () => {
    const server = readyServer();
    server.unseenSameSpecies = 1;
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    await waitFor(() => expect(server.relatedReads).toBe(1));
    expect(panel.querySelector("[data-same-species]")).toBeNull();
    await userEvent.click(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );

    expect(
      await within(panel).findByText(
        /พืชชนิดนี้ถูกบันทึกในรอบนี้แล้ว 1 รายการ/,
      ),
    ).toBeVisible();
    expect(
      panel.querySelector(
        '[data-submit-error="SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED"]',
      ),
    ).not.toBeNull();
    const submit = within(panel).getByRole("button", { name: "ส่งการสังเกต" });
    expect(submit).toBeDisabled();
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: /รับทราบ/ }),
    );
    await userEvent.click(submit);
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งให้ครู" }),
    );

    await screen.findByRole("region", { name: /ส่งให้ครูแล้ว/ });
    expect(server.submits.map((body) => body.acknowledgeSameSpecies)).toEqual([
      false,
      true,
    ]);
    // Both attempts belong to one saved version, so they share one key.
    expect(server.submits[1]!.clientSubmissionId).toBe(
      server.submits[0]!.clientSubmissionId,
    );
  });

  it("opens the conflict dialog and re-applies only the student's edits", async () => {
    const server = readyServer();
    serve(server);
    renderSection();

    const form = await screen.findByRole("region", {
      name: "กรอกข้อมูลพืชเอง",
    });
    const reference = within(form).getByLabelText(/แหล่งอ้างอิง/);
    await userEvent.type(reference, "หนังสือพรรณไม้ หน้า 12");

    // Another screen saves a new common name first.
    server.commonName = "ชบาแดง";
    server.version = 6;

    await userEvent.click(
      within(form).getByRole("button", { name: "บันทึกข้อมูลพืช" }),
    );
    const conflict =
      OBSERVATION_ERROR_PRESENTATIONS.OBSERVATION_VERSION_CONFLICT;
    const dialog = await screen.findByRole("alertdialog", {
      name: conflict.title,
    });
    expect(within(dialog).getByText("แหล่งอ้างอิง (ถ้ามี)")).toBeVisible();
    expect(within(dialog).queryByText("ชื่อไทยหรือชื่อทั่วไป")).toBeNull();
    await userEvent.click(
      within(dialog).getByRole("button", { name: conflict.action }),
    );

    await waitFor(() =>
      expect(
        within(manualForm()).getByLabelText(/ชื่อไทยหรือชื่อทั่วไป/),
      ).toHaveValue("ชบาแดง"),
    );
    expect(within(manualForm()).getByLabelText(/แหล่งอ้างอิง/)).toHaveValue(
      "หนังสือพรรณไม้ หน้า 12",
    );
    await userEvent.click(
      within(manualForm()).getByRole("button", { name: "บันทึกข้อมูลพืช" }),
    );
    await waitFor(() => expect(server.saves).toHaveLength(2));
    expect(server.saves[1]).toMatchObject({
      expectedVersion: 6,
      commonName: "ชบาแดง",
      referenceNote: "หนังสือพรรณไม้ หน้า 12",
    });
  });

  it("shows why submit is unavailable while the session is paused", async () => {
    const server = readyServer();
    server.canSubmit = false;
    server.submitBlockedCode = "SESSION_PAUSED";
    serve(server);
    renderSection();

    const panel = await screen.findByRole("region", { name: "สรุปก่อนส่ง" });
    expect(
      within(panel).getByRole("button", { name: "ส่งการสังเกต" }),
    ).toBeDisabled();
    expect(panel.querySelector("[data-submit-gate]")).toHaveTextContent(
      OBSERVATION_ERROR_PRESENTATIONS.SESSION_PAUSED.description,
    );
  });

  it("disables saving and submitting offline but keeps the typed text", async () => {
    const server = readyServer();
    serve(server);
    renderSection({ online: false });

    const form = await screen.findByRole("region", {
      name: "กรอกข้อมูลพืชเอง",
    });
    await userEvent.type(within(form).getByLabelText(/แหล่งอ้างอิง/), "ครู");
    expect(
      within(form).getByRole("button", { name: "บันทึกข้อมูลพืช" }),
    ).toBeDisabled();
    expect(
      within(form).getByText(/ออฟไลน์อยู่ · บันทึกได้เมื่อกลับมาออนไลน์/),
    ).toBeVisible();
    expect(within(form).getByLabelText(/แหล่งอ้างอิง/)).toHaveValue("ครู");
    expect(
      within(submitPanel()).getByRole("button", { name: "ส่งการสังเกต" }),
    ).toBeDisabled();
  });

  it("keeps the P8 notes usable when the review read model fails, then recovers", async () => {
    const server = new FakeServer();
    const api = serve(server, { reviewFails: true });
    renderSection();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("โหลดส่วนตรวจสอบพืชไม่สำเร็จ");
    expect(
      screen.getByRole("region", { name: "ร่างข้อมูลพืช (P8)" }),
    ).toBeInTheDocument();

    api.recoverReview();
    await userEvent.click(
      within(alert).getByRole("button", { name: "โหลดส่วนตรวจสอบอีกครั้ง" }),
    );
    expect(
      await screen.findByRole("region", { name: "AI ช่วยดูยังไม่เปิดใช้" }),
    ).toBeInTheDocument();
  });
});
