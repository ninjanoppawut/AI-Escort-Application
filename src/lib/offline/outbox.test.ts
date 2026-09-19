import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearLocalForUser, resetLocalStoreForTests } from "./local-store";
import {
  dismissOutbox,
  enqueueOutbox,
  listOutbox,
  runOutbox,
  sendOutboxAction,
  type OutboxAction,
  type OutboxResult,
} from "./outbox";
import { resetDeviceUserIdForTests } from "./use-device-draft";

const userId = "00000000-0000-4000-8000-00000000e001";
const otherUserId = "00000000-0000-4000-8000-00000000e002";
const sessionId = "62000000-0000-4000-8000-00000000e001";

function action(n: number) {
  return {
    id: `82000000-0000-4000-8000-00000000e00${n}`,
    kind: "start_observation" as const,
    scope: sessionId,
    url: "/api/observations/start",
    body: { clientGeneratedId: `82000000-0000-4000-8000-00000000e00${n}` },
    label: `การสังเกต ${n}`,
  };
}

async function enqueueInOrder(count: number) {
  for (let n = 1; n <= count; n += 1) {
    await enqueueOutbox(action(n));
    // createdAt decides order; keep it strictly increasing.
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

describe("offline outbox (P14-01/P14-02)", () => {
  beforeEach(async () => {
    resetLocalStoreForTests();
    resetDeviceUserIdForTests(userId);
    await clearLocalForUser(userId);
    await clearLocalForUser(otherUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDeviceUserIdForTests();
  });

  it("sends queued actions once, oldest first, and removes them", async () => {
    await enqueueInOrder(3);
    const sent: string[] = [];
    const count = await runOutbox(async (queued) => {
      sent.push(queued.id);
      return { ok: true, data: null };
    });
    expect(count).toBe(3);
    expect(sent).toEqual([action(1).id, action(2).id, action(3).id]);
    expect(await listOutbox(sessionId)).toEqual([]);

    // A second run has nothing left to send.
    expect(await runOutbox(async () => ({ ok: true, data: null }))).toBe(0);
  });

  it("stops on a network failure and keeps the rest for the next reconnect", async () => {
    await enqueueInOrder(3);
    const send = vi
      .fn<(queued: OutboxAction) => Promise<OutboxResult>>()
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, kind: "network" });
    expect(await runOutbox(send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    const left = await listOutbox(sessionId);
    expect(left.map((queued) => [queued.id, queued.status])).toEqual([
      [action(2).id, "pending"],
      [action(3).id, "pending"],
    ]);
    expect(left[0]?.attempts).toBe(1);
  });

  it("keeps a refused action as failed with its code until dismissed", async () => {
    await enqueueInOrder(2);
    const send = vi
      .fn<(queued: OutboxAction) => Promise<OutboxResult>>()
      .mockResolvedValueOnce({
        ok: false,
        kind: "denied",
        code: "SESSION_PAUSED",
      })
      .mockResolvedValueOnce({ ok: true, data: null });
    expect(await runOutbox(send)).toBe(1);
    const [failed] = await listOutbox(sessionId);
    expect(failed).toMatchObject({
      id: action(1).id,
      status: "failed",
      errorCode: "SESSION_PAUSED",
    });

    // A failed action is not retried automatically.
    const again = vi.fn<(queued: OutboxAction) => Promise<OutboxResult>>();
    expect(await runOutbox(again)).toBe(0);
    expect(again).not.toHaveBeenCalled();

    await dismissOutbox(action(1).id);
    expect(await listOutbox(sessionId)).toEqual([]);
  });

  it("never shows or sends another account's queued actions", async () => {
    await enqueueInOrder(1);
    resetDeviceUserIdForTests(otherUserId);
    expect(await listOutbox()).toEqual([]);
    const send = vi.fn<(queued: OutboxAction) => Promise<OutboxResult>>();
    expect(await runOutbox(send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("treats only a transport failure or an unexplained 5xx as retryable", async () => {
    const queued: OutboxAction = {
      ...action(1),
      status: "pending",
      errorCode: null,
      attempts: 0,
      createdAt: 1,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await sendOutboxAction(queued)).toEqual({
      ok: false,
      kind: "network",
    });

    fetchMock.mockResolvedValueOnce(
      new Response("bad gateway", { status: 502 }),
    );
    expect(await sendOutboxAction(queued)).toEqual({
      ok: false,
      kind: "network",
    });

    fetchMock.mockResolvedValueOnce(
      Response.json(
        { data: null, error: { code: "VERSION_CONFLICT" }, requestId: "x" },
        { status: 409 },
      ),
    );
    expect(await sendOutboxAction(queued)).toEqual({
      ok: false,
      kind: "denied",
      code: "VERSION_CONFLICT",
    });

    fetchMock.mockResolvedValueOnce(
      Response.json({ data: { id: "o1" }, error: null, requestId: "x" }),
    );
    expect(await sendOutboxAction(queued)).toEqual({
      ok: true,
      data: { id: "o1" },
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/observations/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(queued.body),
      }),
    );
  });
});
