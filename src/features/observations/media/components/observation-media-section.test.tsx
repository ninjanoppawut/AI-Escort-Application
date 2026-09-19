import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ProcessedImage } from "@/lib/image-processing";

import type {
  MediaItemView,
  MediaListView,
  MediaRecord,
  RegisterMediaRequest,
} from "../contracts";
import type { StorageUploadResult } from "../client/storage-upload";
import {
  createUploadQueue,
  type UploadQueueDeps,
  type UploadQueueEnvironment,
  type UploadRequest,
} from "../client/upload-queue";
import { ObservationMediaSection } from "./observation-media-section";

const observationId = "81000000-0000-4000-8000-000000009101";
const requestId = "90000000-0000-4000-8000-000000009101";
const STORAGE_PATH_PREFIX = "20000000-class/62000000-session/81000000-obs";

const pad = (n: number) => String(n).padStart(12, "0");
const localId = (n: number) => `90000000-0000-4000-8000-${pad(n)}`;
const serverMediaId = (n: number) => `91000000-0000-4000-8000-${pad(n)}`;
const mediaIdForLocal = (client: string) => `92${client.slice(2)}`;

beforeAll(() => {
  // jsdom has no CSS.escape; user-event needs it to walk named radios.
  if (!("CSS" in window) || typeof window.CSS?.escape !== "function") {
    Object.defineProperty(window, "CSS", {
      configurable: true,
      value: {
        escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
      },
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function serverItem(
  n: number,
  overrides: Partial<MediaItemView> = {},
): MediaItemView {
  return {
    id: serverMediaId(n),
    clientMediaId: localId(500 + n),
    position: n,
    category: "leaf",
    status: "uploaded",
    mimeType: "image/webp",
    byteSize: 400_000,
    width: 1536,
    height: 2048,
    capturedAt: "2026-09-19T03:00:00+00:00",
    uploadedAt: "2026-09-19T03:00:05+00:00",
    submitted: false,
    signedUrl: `https://storage.example.test/signed/${n}?token=t${n}`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mediaList(
  items: MediaItemView[],
  permissions: Partial<MediaListView["permissions"]> = {},
): MediaListView {
  const live = items.filter((item) => item.status !== "deleting").length;
  return {
    observationId,
    permissions: {
      canEdit: true,
      blockedCode: null,
      blockedReason: null,
      ...permissions,
    },
    limits: { maxImages: 10, remaining: Math.max(0, 10 - live) },
    summary: {
      uploadedCount: items.filter((item) => item.status === "uploaded").length,
      pendingCount: items.filter((item) => item.status === "pending").length,
      hasWholePlant: items.some(
        (item) => item.status === "uploaded" && item.category === "whole_plant",
      ),
    },
    items,
    refreshedAt: "2026-09-19T03:10:00+00:00",
  };
}

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface ApiCall {
  method: string;
  url: string;
  body: unknown;
}

function mockMediaApi(initial: MediaListView) {
  let list = initial;
  const calls: ApiCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const base = `/api/observations/${observationId}/media`;
    if (url === base && method === "GET") return envelope(list);
    const match = url.match(/\/media\/([0-9a-f-]{36})$/);
    if (match && method === "DELETE") {
      list = mediaList(list.items.filter((item) => item.id !== match[1]));
      return envelope({ outcome: "deleted", retryable: false });
    }
    if (match && method === "PATCH") {
      const { category } = JSON.parse(String(init?.body)) as {
        category: MediaItemView["category"];
      };
      list = mediaList(
        list.items.map((item) =>
          item.id === match[1] ? { ...item, category } : item,
        ),
      );
      return envelope({ outcome: "updated", category });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return {
    calls,
    setList(next: MediaListView) {
      list = next;
    },
  };
}

function processedImage(label: string): ProcessedImage {
  return {
    blob: new Blob([`processed-${label}`], { type: "image/webp" }),
    mimeType: "image/webp",
    width: 1536,
    height: 2048,
    byteSize: 400_000,
    sha256: "b".repeat(64),
    preprocessingVersion: "img-v1",
    previewUrl: `blob:preview-${label}`,
  };
}

function mediaRecord(body: RegisterMediaRequest): MediaRecord {
  const id = mediaIdForLocal(body.clientMediaId);
  return {
    id,
    clientMediaId: body.clientMediaId,
    position: 1,
    category: body.category,
    status: "pending",
    mimeType: body.mimeType,
    byteSize: body.byteSize,
    width: body.width,
    height: body.height,
    capturedAt: body.capturedAt,
    uploadedAt: null,
    submitted: false,
    upload: {
      bucket: "observation-images",
      path: `${STORAGE_PATH_PREFIX}/${id}.webp`,
      contentType: body.mimeType,
    },
  };
}

function fakeQueue(
  overrides: Partial<UploadQueueDeps> = {},
  { online = true }: { online?: boolean } = {},
) {
  let ids = 0;
  let processed = 0;
  const environment: UploadQueueEnvironment = {
    isOnline: () => online,
    listen: () => () => undefined,
  };
  const deps: UploadQueueDeps = {
    process: vi.fn(async () => processedImage(String(++processed))),
    register: vi.fn(async (body: RegisterMediaRequest) => ({
      outcome: "created" as const,
      media: mediaRecord(body),
    })),
    upload: vi.fn(async (): Promise<StorageUploadResult> => ({ ok: true })),
    complete: vi.fn(async () => ({ outcome: "uploaded" })),
    remove: vi.fn(async () => ({ outcome: "deleted", retryable: false })),
    getAccessToken: vi.fn(async () => "token"),
    refreshAuth: vi.fn(async () => true),
    now: () => Date.parse("2026-09-19T03:00:00.000Z"),
    random: () => 0.5,
    sleep: vi.fn(async () => undefined),
    createId: () => localId(++ids),
    revokePreview: vi.fn(),
    ...overrides,
  };
  return { queue: createUploadQueue(deps, environment), deps };
}

function renderSection(queue: ReturnType<typeof fakeQueue>["queue"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ObservationMediaSection observationId={observationId} queue={queue} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

function galleryInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>(
    'input[type="file"][data-media-input="gallery"]',
  )!;
}

function photo(name = "plant.jpg") {
  return new File(["raw-camera-bytes"], name, { type: "image/jpeg" });
}

async function findSection(countText: string) {
  return screen.findByRole("region", {
    name: `ภาพหลักฐาน · ${countText}`,
  });
}

/** Capture stays disabled until the authoritative list has loaded. */
async function waitForEditable() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "เลือกจากคลัง" })).toBeEnabled(),
  );
}

describe("ObservationMediaSection", () => {
  it("shows the empty state with the whole-plant requirement and both capture actions", async () => {
    mockMediaApi(mediaList([]));
    const { queue } = fakeQueue();
    const { container } = renderSection(queue);

    const section = await findSection("0 จาก 10");
    expect(
      within(section).getByText("ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ"),
    ).toHaveAttribute("data-whole-plant", "missing");
    expect(await within(section).findByText("ยังไม่มีภาพ")).toBeVisible();
    const camera = within(section).getByRole("button", { name: "ถ่ายภาพ" });
    const gallery = within(section).getByRole("button", {
      name: "เลือกจากคลัง",
    });
    expect(camera).toBeEnabled();
    expect(gallery).toBeEnabled();
    expect(container.querySelector("[data-disabled-reason]")).toBeNull();

    const cameraInput = container.querySelector<HTMLInputElement>(
      'input[data-media-input="camera"]',
    )!;
    expect(cameraInput).toHaveAttribute("capture", "environment");
    expect(cameraInput).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(galleryInput(container)).toHaveAttribute("multiple");
  });

  it("disables both capture actions with the reason at ten images", async () => {
    mockMediaApi(
      mediaList(
        Array.from({ length: 10 }, (_, index) =>
          serverItem(index + 1, {
            category: index === 0 ? "whole_plant" : "leaf",
          }),
        ),
      ),
    );
    const { queue } = fakeQueue();
    renderSection(queue);

    const section = await findSection("10 จาก 10");
    const reason = within(section).getByText(
      "ครบ 10 ภาพแล้ว — ลบภาพที่ไม่ต้องการก่อนเพิ่มภาพใหม่",
    );
    for (const name of ["ถ่ายภาพ", "เลือกจากคลัง"]) {
      const button = within(section).getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-describedby", reason.id);
    }
    expect(within(section).getAllByRole("listitem")).toHaveLength(10);
  });

  it("keeps images visible but blocks editing with the draft's reason", async () => {
    mockMediaApi(
      mediaList([serverItem(1, { category: "whole_plant" })], {
        canEdit: false,
        blockedCode: "INVALID_STATUS_TRANSITION",
        blockedReason: "group_completed",
      }),
    );
    const user = userEvent.setup();
    const { queue } = fakeQueue();
    renderSection(queue);

    const section = await findSection("1 จาก 10");
    expect(
      within(section).getByText(
        "เพิ่มหรือลบภาพไม่ได้ · กลุ่มของคุณสำรวจเสร็จแล้ว",
      ),
    ).toBeVisible();
    expect(
      within(section).getByRole("button", { name: "ถ่ายภาพ" }),
    ).toBeDisabled();

    await user.click(
      within(section).getByRole("button", { name: /^ภาพที่ 1 · ทั้งต้น/ }),
    );
    expect(within(section).queryByRole("button", { name: "ลบภาพ" })).toBeNull();
    expect(within(section).queryByRole("radiogroup")).toBeNull();
  });

  it("uploads a first image as the whole plant and flips the indicator", async () => {
    const api = mockMediaApi(mediaList([]));
    const user = userEvent.setup();
    const { queue, deps } = fakeQueue({
      // The server lists the image as uploaded once it is confirmed.
      complete: vi.fn(async () => {
        api.setList(
          mediaList([
            serverItem(1, {
              id: mediaIdForLocal(localId(1)),
              clientMediaId: localId(1),
              category: "whole_plant",
            }),
          ]),
        );
        return { outcome: "uploaded" };
      }),
    });
    const { container } = renderSection(queue);
    await findSection("0 จาก 10");

    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    await waitFor(() => expect(deps.complete).toHaveBeenCalled());
    expect(vi.mocked(deps.register).mock.calls[0]![0].category).toBe(
      "whole_plant",
    );

    const section = await findSection("1 จาก 10");
    await waitFor(() =>
      expect(within(section).getByText("มีภาพทั้งต้นแล้ว")).toHaveAttribute(
        "data-whole-plant",
        "present",
      ),
    );
    const tile = container.querySelector(`[data-media-tile="${localId(1)}"]`)!;
    expect(tile).toHaveAttribute("data-tile-state", "uploaded");
    expect(tile).toHaveTextContent("อัปโหลดแล้ว");
    const image = within(tile as HTMLElement).getByRole("img", {
      name: "ภาพที่ 1 · ทั้งต้น",
    });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    await waitFor(() =>
      expect(
        container.querySelector("[data-media-announcer]"),
      ).toHaveTextContent("ส่งภาพทั้งต้นแล้ว"),
    );
    // Once the server lists it, the local copy and its preview are released.
    await waitFor(() =>
      expect(deps.revokePreview).toHaveBeenCalledWith("blob:preview-1"),
    );
  });

  it("counts only uploaded images toward the whole-plant indicator", async () => {
    mockMediaApi(
      mediaList([
        serverItem(1, {
          category: "whole_plant",
          status: "pending",
          signedUrl: null,
          expiresAt: null,
        }),
      ]),
    );
    const { queue } = fakeQueue();
    const { container } = renderSection(queue);

    const section = await findSection("1 จาก 10");
    expect(
      within(section).getByText("ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ"),
    ).toBeVisible();
    // A reserved row without local bytes must be taken again.
    const tile = container.querySelector("[data-tile-state]")!;
    expect(tile).toHaveAttribute("data-tile-state", "retake");
    expect(tile).toHaveTextContent("ต้องถ่ายใหม่");
  });

  it("shows a failed tile with a red border and retries it on tap", async () => {
    mockMediaApi(mediaList([]));
    const user = userEvent.setup();
    let fail = true;
    const { queue, deps } = fakeQueue({
      upload: vi.fn(async (): Promise<StorageUploadResult> =>
        fail ? { ok: false, kind: "retryable", status: 0 } : { ok: true },
      ),
      // Keep the automatic retry pending so the failure stays visible.
      sleep: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const { container } = renderSection(queue);
    await findSection("0 จาก 10");

    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    const retry = await screen.findByRole("button", {
      name: /ส่งภาพนี้ไม่สำเร็จ — แตะเพื่อลองใหม่/,
    });
    const tile = retry.closest("li")!;
    expect(tile).toHaveAttribute("data-tile-state", "failed");
    expect(tile.className).toContain("border-[#B3261E]");
    expect(
      within(tile).getByText("ส่งภาพนี้ไม่สำเร็จ — แตะเพื่อลองใหม่"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ลองใหม่ทั้งหมด" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        container.querySelector("[data-media-announcer]"),
      ).toHaveTextContent(
        "ส่งภาพไม่สำเร็จ เพราะสัญญาณขาด — ระบบจะลองใหม่ให้อัตโนมัติ",
      ),
    );

    fail = false;
    await user.click(retry);
    await waitFor(() =>
      expect(
        container.querySelector(`[data-media-tile="${localId(1)}"]`),
      ).toHaveAttribute("data-tile-state", "uploaded"),
    );
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledWith(mediaIdForLocal(localId(1)), 2);
  });

  it("asks for a category through a keyboard-operable radio group before sending", async () => {
    mockMediaApi(mediaList([serverItem(1, { category: "whole_plant" })]));
    const user = userEvent.setup();
    const { queue, deps } = fakeQueue();
    const { container } = renderSection(queue);
    await findSection("1 จาก 10");

    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    const group = await screen.findByRole("radiogroup", {
      name: "ประเภทของภาพนี้",
    });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "whole_plant",
      "leaf",
      "leaf_underside",
      "stem_trunk",
      "flower",
      "fruit",
      "habitat",
      "other",
    ]);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(
      true,
    );
    const send = screen.getByRole("button", { name: "ส่งภาพนี้" });
    expect(send).toBeDisabled();
    expect(deps.register).not.toHaveBeenCalled();
    expect(
      container.querySelector(`[data-media-tile="${localId(1)}"]`),
    ).toHaveAttribute("data-tile-state", "needs_category");

    await user.click(within(group).getByRole("radio", { name: "ใบ" }));
    expect(within(group).getByRole("radio", { name: "ใบ" })).toBeChecked();
    await user.keyboard("{ArrowRight}");
    const underside = within(group).getByRole("radio", { name: "ใบด้านล่าง" });
    expect(underside).toBeChecked();
    expect(underside).toHaveFocus();
    expect(send).toBeEnabled();
    expect(deps.register).not.toHaveBeenCalled();

    await user.click(send);
    await waitFor(() => expect(deps.register).toHaveBeenCalledTimes(1));
    expect(vi.mocked(deps.register).mock.calls[0]![0].category).toBe(
      "leaf_underside",
    );
  });

  it("changes an uploaded image's category on the server", async () => {
    const api = mockMediaApi(
      mediaList([
        serverItem(1, { category: "whole_plant" }),
        serverItem(2, { category: "leaf" }),
      ]),
    );
    const user = userEvent.setup();
    const { queue } = fakeQueue();
    renderSection(queue);
    const section = await findSection("2 จาก 10");

    await user.click(
      within(section).getByRole("button", { name: /^ภาพที่ 2 · ใบ/ }),
    );
    const group = within(section).getByRole("radiogroup", {
      name: "ประเภทของภาพนี้",
    });
    expect(within(group).getByRole("radio", { name: "ใบ" })).toBeChecked();
    const save = within(section).getByRole("button", { name: "บันทึกประเภท" });
    expect(save).toBeDisabled();
    await user.click(within(group).getByRole("radio", { name: "ดอก" }));
    await user.click(save);

    await waitFor(() =>
      expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({
        url: `/api/observations/${observationId}/media/${serverMediaId(2)}`,
        body: { category: "flower" },
      }),
    );
    expect(
      await within(section).findByRole("button", { name: /^ภาพที่ 2 · ดอก/ }),
    ).toBeVisible();
  });

  it("blocks deleting the last whole-plant image and confirms other deletes", async () => {
    const api = mockMediaApi(
      mediaList([
        serverItem(1, { category: "whole_plant" }),
        serverItem(2, { category: "leaf" }),
      ]),
    );
    const user = userEvent.setup();
    const { queue } = fakeQueue();
    const { container } = renderSection(queue);
    const section = await findSection("2 จาก 10");

    await user.click(
      within(section).getByRole("button", { name: /^ภาพที่ 1 · ทั้งต้น/ }),
    );
    const guarded = within(section).getByRole("button", { name: "ลบภาพ" });
    expect(guarded).toBeDisabled();
    const reason = within(section).getByText(
      "ลบภาพทั้งต้นภาพสุดท้ายไม่ได้ — เพิ่มภาพทั้งต้นใหม่ก่อน",
    );
    expect(guarded).toHaveAttribute("aria-describedby", reason.id);

    await user.click(
      within(section).getByRole("button", { name: /^ภาพที่ 2 · ใบ/ }),
    );
    await user.click(within(section).getByRole("button", { name: "ลบภาพ" }));
    const dialog = screen.getByRole("alertdialog", { name: "ลบภาพนี้?" });
    expect(dialog).toHaveTextContent(
      "ภาพที่ 2 (ใบ) จะถูกลบออกจากการสังเกตนี้ และกู้คืนไม่ได้",
    );
    expect(within(dialog).getByRole("button", { name: "ไม่ลบ" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "ลบภาพ" }));

    await waitFor(() =>
      expect(api.calls.some((call) => call.method === "DELETE")).toBe(true),
    );
    expect(api.calls.find((call) => call.method === "DELETE")!.url).toBe(
      `/api/observations/${observationId}/media/${serverMediaId(2)}`,
    );
    await findSection("1 จาก 10");
    await waitFor(() =>
      expect(
        container.querySelector("[data-media-announcer]"),
      ).toHaveTextContent("ลบภาพแล้ว"),
    );
  });

  it("never renders a storage path or capture coordinates", async () => {
    mockMediaApi(mediaList([]));
    const user = userEvent.setup();
    const held: ((result: StorageUploadResult) => void)[] = [];
    const { queue } = fakeQueue({
      upload: vi.fn(
        (request: UploadRequest) =>
          new Promise<StorageUploadResult>((resolve) => {
            request.onProgress(0.4);
            held.push(resolve);
          }),
      ),
    });
    const { container } = renderSection(queue);
    await findSection("0 จาก 10");

    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    const progress = await screen.findByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "40");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress.closest("li")).toHaveTextContent("กำลังอัปโหลด 40%");
    expect(screen.getByText("กำลังส่งภาพ 1 จาก 1")).toBeVisible();
    expect(screen.getByText("ภาพที่ยังไม่ส่งจะหายถ้าปิดหน้านี้")).toBeVisible();

    expect(container.innerHTML).not.toContain(STORAGE_PATH_PREFIX);
    expect(container.innerHTML).not.toContain("/storage/v1/");
    expect(container.textContent).not.toMatch(/\d{1,3}\.\d{4,}/);

    // Closing the tab now would lose the image, so the page asks first.
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await act(async () => held[0]!({ ok: true }));
    await waitFor(() =>
      expect(
        screen.queryByText("ภาพที่ยังไม่ส่งจะหายถ้าปิดหน้านี้"),
      ).toBeNull(),
    );
    expect(container.innerHTML).not.toContain(STORAGE_PATH_PREFIX);
  });

  it("holds images offline with a banner and a waiting tile", async () => {
    mockMediaApi(mediaList([]));
    const user = userEvent.setup();
    const { queue, deps } = fakeQueue({}, { online: false });
    const { container } = renderSection(queue);
    await findSection("0 จาก 10");

    expect(screen.getByText("ออฟไลน์อยู่")).toBeVisible();
    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    await waitFor(() =>
      expect(
        container.querySelector(`[data-media-tile="${localId(1)}"]`),
      ).toHaveAttribute("data-tile-state", "waiting"),
    );
    expect(
      container.querySelector(`[data-media-tile="${localId(1)}"]`),
    ).toHaveTextContent("รอส่ง");
    expect(screen.getByText("รอส่ง 1 ภาพ")).toBeVisible();
    expect(deps.register).not.toHaveBeenCalled();
    await findSection("1 จาก 10");
  });

  it("explains a processing failure and lets the student remove the image", async () => {
    mockMediaApi(mediaList([]));
    const user = userEvent.setup();
    const { queue, deps } = fakeQueue({
      process: vi.fn(async () => ({ ...processedImage("1"), sha256: null })),
    });
    const { container } = renderSection(queue);
    await findSection("0 จาก 10");

    await waitForEditable();
    await user.upload(galleryInput(container), photo());
    const tileButton = await screen.findByRole("button", {
      name: /ใช้ภาพนี้ไม่ได้/,
    });
    await user.click(tileButton);
    const panel = container.querySelector<HTMLElement>("[data-media-panel]")!;
    expect(within(panel).getByText("ประมวลผลรูปไม่สำเร็จ")).toBeVisible();
    expect(within(panel).getByText("ลองเลือกรูปอีกครั้ง")).toBeVisible();
    expect(deps.register).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "นำภาพนี้ออก" }));
    expect(container.querySelector("[data-media-tile]")).toBeNull();
    expect(screen.getByText("ยังไม่มีภาพ")).toBeVisible();
  });

  it("caps a gallery pick at the remaining slots and says so", async () => {
    mockMediaApi(
      mediaList(
        Array.from({ length: 9 }, (_, index) =>
          serverItem(index + 1, {
            category: index === 0 ? "whole_plant" : "leaf",
          }),
        ),
      ),
    );
    const { queue, deps } = fakeQueue();
    const { container } = renderSection(queue);
    await findSection("9 จาก 10");
    await waitForEditable();
    expect(galleryInput(container)).not.toHaveAttribute("multiple");

    // The input would be single-select here; fire a multi-file change anyway.
    const input = galleryInput(container);
    const files = [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")];
    Object.defineProperty(input, "files", {
      configurable: true,
      value: Object.assign(files, { item: (index: number) => files[index] }),
    });
    fireEvent.change(input);

    await waitFor(() =>
      expect(container.querySelector("[data-media-notice]")).toHaveTextContent(
        "เลือกมา 3 ภาพ แต่เพิ่มได้อีก 1 ภาพ — เพิ่ม 1 ภาพแรกแล้ว",
      ),
    );
    expect(container.querySelector("[data-media-announcer]")).toHaveTextContent(
      "เลือกมา 3 ภาพ แต่เพิ่มได้อีก 1 ภาพ — เพิ่ม 1 ภาพแรกแล้ว",
    );
    await findSection("10 จาก 10");
    await waitFor(() => expect(deps.process).toHaveBeenCalledTimes(1));
  });

  it("shows camera help when the camera permission is denied and keeps the gallery", async () => {
    mockMediaApi(mediaList([]));
    const status = Object.assign(new EventTarget(), { state: "denied" });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => status) },
    });
    try {
      const { queue } = fakeQueue();
      renderSection(queue);
      expect(await screen.findByText("ไม่ได้รับสิทธิ์กล้อง")).toBeVisible();
      expect(
        screen.getByText(/Chrome \(Android\): แตะไอคอนหน้าช่องที่อยู่เว็บ/),
      ).toBeVisible();
      await findSection("0 จาก 10");
      expect(
        screen.getByRole("button", { name: "เลือกจากคลัง" }),
      ).toBeEnabled();
    } finally {
      Reflect.deleteProperty(navigator, "permissions");
    }
  });

  it("re-signs a broken image once, then shows a placeholder", async () => {
    const api = mockMediaApi(
      mediaList([serverItem(1, { category: "whole_plant" })]),
    );
    const { queue } = fakeQueue();
    renderSection(queue);
    const section = await findSection("1 จาก 10");

    const first = within(section).getByRole("img", {
      name: "ภาพที่ 1 · ทั้งต้น",
    });
    expect(first).toHaveAttribute("src", serverItem(1).signedUrl);
    api.setList(
      mediaList([
        serverItem(1, {
          category: "whole_plant",
          signedUrl: "https://storage.example.test/signed/1?token=fresh",
        }),
      ]),
    );
    fireEvent.error(first);

    await waitFor(() =>
      expect(
        within(section).getByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
      ).toHaveAttribute(
        "src",
        "https://storage.example.test/signed/1?token=fresh",
      ),
    );
    expect(api.calls.filter((call) => call.method === "GET")).toHaveLength(2);

    fireEvent.error(
      within(section).getByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
    );
    expect(await within(section).findByText("โหลดภาพไม่สำเร็จ")).toBeVisible();
    expect(api.calls.filter((call) => call.method === "GET")).toHaveLength(2);
  });
});
