import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLocalForUser,
  deleteLocal,
  getLocal,
  listLocal,
  localStoreAvailable,
  putLocal,
  resetLocalStoreForTests,
} from "./local-store";

const ada = "00000000-0000-4000-8000-00000000a001";
const bo = "00000000-0000-4000-8000-00000000b001";

describe("device local store", () => {
  beforeEach(async () => {
    resetLocalStoreForTests();
    await clearLocalForUser(ada);
    await clearLocalForUser(bo);
  });

  it("keeps records per user and scope, oldest first", async () => {
    expect(localStoreAvailable()).toBe(true);
    await putLocal("drafts", {
      key: "obs-1",
      scope: "session-1",
      userId: ada,
      updatedAt: 2,
      value: { commonName: "ชบา" },
    });
    await putLocal("drafts", {
      key: "obs-2",
      scope: "session-1",
      userId: ada,
      updatedAt: 1,
      value: { commonName: "มะม่วง" },
    });
    await putLocal("drafts", {
      key: "obs-3",
      scope: "session-1",
      userId: bo,
      updatedAt: 1,
      value: { commonName: "เฟิน" },
    });

    const mine = await listLocal<{ commonName: string }>(
      "drafts",
      ada,
      "session-1",
    );
    expect(mine.map((record) => record.value.commonName)).toEqual([
      "มะม่วง",
      "ชบา",
    ]);
    expect(await getLocal("drafts", "obs-3", ada)).toBeNull();
    expect((await getLocal("drafts", "obs-3", bo))?.value).toEqual({
      commonName: "เฟิน",
    });
  });

  it("stores image bytes and deletes and clears records", async () => {
    await putLocal("uploads", {
      key: "media-1",
      scope: "obs-1",
      userId: ada,
      updatedAt: 1,
      value: { bytes: new Uint8Array([1, 2, 3]).buffer },
    });
    const stored = await getLocal<{ bytes: ArrayBuffer }>(
      "uploads",
      "media-1",
      ada,
    );
    expect(new Uint8Array(stored!.value.bytes)).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    await deleteLocal("uploads", "media-1");
    expect(await getLocal("uploads", "media-1", ada)).toBeNull();

    await putLocal("outbox", {
      key: "o-1",
      scope: "s",
      userId: ada,
      updatedAt: 1,
      value: 1,
    });
    await clearLocalForUser(ada);
    expect(await listLocal("outbox", ada)).toEqual([]);
  });
});
