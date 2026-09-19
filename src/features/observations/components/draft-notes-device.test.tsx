import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLocalForUser,
  getLocal,
  resetLocalStoreForTests,
} from "@/lib/offline/local-store";
import { resetDeviceUserIdForTests } from "@/lib/offline/use-device-draft";

import { observationDraftSchema, type ObservationDraft } from "../contracts";
import { DraftNotesForm } from "./draft-notes-form";

const userId = "00000000-0000-4000-8000-00000000d001";
const observationId = "81000000-0000-4000-8000-000000008681";

function makeDraft(version = 2): ObservationDraft {
  return observationDraftSchema.parse({
    id: observationId,
    clientGeneratedId: "82000000-0000-4000-8000-000000008681",
    status: "draft",
    version,
    capture: {
      locationStatus: "captured",
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 8,
      capturedAt: "2026-09-19T02:00:00+00:00",
      unavailableReason: null,
    },
    draft: { commonName: "มะม่วง", scientificName: null, evidenceNote: null },
    session: {
      id: "62000000-0000-4000-8000-000000008681",
      classId: "20000000-0000-4000-8000-000000008681",
      title: "Morning round",
      status: "open",
    },
    activity: {
      id: "60000000-0000-4000-8000-000000008681",
      title: "Garden survey",
    },
    groupStatus: "active",
    permissions: { canEdit: true, blockedCode: null, blockedReason: null },
    createdAt: "2026-09-19T02:00:00+00:00",
    updatedAt: "2026-09-19T02:00:00+00:00",
    refreshedAt: "2026-09-19T02:10:00+00:00",
  });
}

function renderForm(online: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onSaved = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DraftNotesForm
        observation={makeDraft()}
        onConflict={vi.fn()}
        onSaved={onSaved}
        onStatusChanged={vi.fn()}
        online={online}
      />
    </QueryClientProvider>,
  );
  const rerender = (nextOnline: boolean) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <DraftNotesForm
          observation={makeDraft()}
          onConflict={vi.fn()}
          onSaved={onSaved}
          onStatusChanged={vi.fn()}
          online={nextOnline}
        />
      </QueryClientProvider>,
    );
  return { ...view, rerender, onSaved };
}

const kept = () => getLocal("drafts", `draft-notes:${observationId}`, userId);

describe("DraftNotesForm device drafts (P14-01)", () => {
  beforeEach(async () => {
    resetLocalStoreForTests();
    resetDeviceUserIdForTests(userId);
    await clearLocalForUser(userId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDeviceUserIdForTests();
  });

  it("keeps text typed offline, restores it after a restart, and sends it on reconnect", async () => {
    const puts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      puts.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          data: { outcome: "updated", version: 3 },
          error: null,
          requestId: "90000000-0000-4000-8000-000000008681",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const first = renderForm(false);
    await userEvent.type(
      screen.getByLabelText("ชื่อวิทยาศาสตร์"),
      "Mangifera indica",
    );
    await waitFor(async () =>
      expect((await kept())?.value).toEqual({
        values: {
          commonName: "มะม่วง",
          scientificName: "Mangifera indica",
          evidenceNote: "",
        },
        baseVersion: 2,
      }),
    );
    expect(
      await screen.findByText(/บันทึกในเครื่องนี้แล้ว จะส่งเข้าระบบเอง/),
    ).toBeVisible();
    first.unmount();

    // A browser restart: the form comes back with the kept text, still offline.
    const second = renderForm(false);
    await waitFor(() =>
      expect(screen.getByLabelText("ชื่อวิทยาศาสตร์")).toHaveValue(
        "Mangifera indica",
      ),
    );
    expect(puts).toHaveLength(0);

    // Back online: the kept text is saved once with its base version.
    second.rerender(true);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      expectedVersion: 2,
      commonName: "มะม่วง",
      scientificName: "Mangifera indica",
      evidenceNote: null,
    });
    await waitFor(async () => expect(await kept()).toBeNull());
  });
});
