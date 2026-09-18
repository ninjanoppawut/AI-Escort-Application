import { describe, expect, it } from "vitest";

import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  mediaItemViewSchema,
  registerMediaRequestSchema,
} from "./contracts";
import {
  MEDIA_UI_ERROR_CODES,
  httpStatusForMediaError,
  mediaErrorPresentation,
} from "./errors";
import { interpretMediaRow } from "./results";

const media = {
  id: "91000000-0000-4000-8000-000000000001",
  clientMediaId: "90000000-0000-4000-8000-000000000001",
  position: 1,
  category: "whole_plant",
  status: "pending",
  mimeType: "image/webp",
  byteSize: 400_000,
  width: 2048,
  height: 1536,
  capturedAt: "2026-09-19T03:00:00+00:00",
  uploadedAt: null,
  upload: {
    bucket: "observation-images",
    path: "class/session/observation/media.webp",
    contentType: "image/webp",
  },
};

const register = {
  clientMediaId: "90000000-0000-4000-8000-000000000001",
  category: "leaf",
  mimeType: "image/jpeg",
  byteSize: 5_242_880,
  width: 2048,
  height: 1536,
  sha256: "a".repeat(64),
  preprocessingVersion: "img-v1",
  capturedAt: "2026-09-19T10:00:00+07:00",
};

describe("media register request", () => {
  it("accepts processed images within the documented limits", () => {
    expect(registerMediaRequestSchema.safeParse(register).success).toBe(true);
  });

  it("rejects oversized, wrongly typed, or unhashed images and extra keys", () => {
    for (const patch of [
      { byteSize: 5_242_881 },
      { width: 2049 },
      { mimeType: "image/heic" },
      { category: "root" },
      { sha256: "abc" },
      { preprocessingVersion: "v1" },
      { storagePath: "a/b" },
    ]) {
      expect(
        registerMediaRequestSchema.safeParse({ ...register, ...patch }).success,
      ).toBe(false);
    }
  });

  it("labels all eight documented categories in Thai", () => {
    expect(MEDIA_CATEGORIES).toHaveLength(8);
    for (const category of MEDIA_CATEGORIES) {
      expect(MEDIA_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe("media results", () => {
  it("returns created and existing reservations with the upload target", () => {
    const created = interpretMediaRow(
      { outcome: "created", error_code: null, error_details: null, media },
      ["created", "existing"],
    );
    expect(created.data?.media?.upload.path).toBe(media.upload.path);
  });

  it("keeps only safe denial details", () => {
    const limit = interpretMediaRow(
      {
        outcome: "denied",
        error_code: "IMAGE_LIMIT_EXCEEDED",
        error_details: { maxImages: 10, path: "leak" },
        media: null,
      },
      ["created"],
    );
    expect(limit.status).toBe(409);
    expect(limit.error?.details).toEqual({ maxImages: 10 });

    const incomplete = interpretMediaRow(
      {
        outcome: "denied",
        error_code: "IMAGE_UPLOAD_INCOMPLETE",
        error_details: { reason: "mismatch" },
        media: null,
      },
      ["uploaded"],
    );
    expect(incomplete.status).toBe(409);
    expect(incomplete.error?.retryable).toBe(true);
    expect(incomplete.error?.details).toEqual({ reason: "mismatch" });

    const tooLarge = interpretMediaRow(
      {
        outcome: "denied",
        error_code: "IMAGE_TOO_LARGE",
        error_details: { reason: "dimensions" },
        media: null,
      },
      ["created"],
    );
    expect(tooLarge.status).toBe(422);
  });

  it("denies unexpected outcomes, codes, and shapes", () => {
    expect(
      interpretMediaRow(
        {
          outcome: "deleted",
          error_code: null,
          error_details: null,
          media: null,
        },
        ["created"],
      ).status,
    ).toBe(403);
    expect(
      interpretMediaRow(
        {
          outcome: "denied",
          error_code: "NEW_CODE",
          error_details: null,
          media: null,
        },
        ["created"],
      ).status,
    ).toBe(403);
    expect(
      interpretMediaRow(
        {
          outcome: "created",
          error_code: null,
          error_details: null,
          media: { ...media, storagePath: "x" },
        },
        ["created"],
      ).status,
    ).toBe(403);
    expect(interpretMediaRow(undefined, ["created"]).status).toBe(403);
  });
});

describe("media errors and views", () => {
  it("presents every code with a title and maps HTTP statuses", () => {
    for (const code of MEDIA_UI_ERROR_CODES) {
      expect(mediaErrorPresentation(code).title).toBeTruthy();
    }
    expect(mediaErrorPresentation("IMAGE_LIMIT_EXCEEDED")).toMatchObject({
      title: "เพิ่มรูปได้สูงสุด 10 รูป",
      action: "ลบรูปก่อนเพิ่ม",
    });
    expect(httpStatusForMediaError("INVALID_IMAGE_TYPE")).toBe(422);
    expect(httpStatusForMediaError("FORBIDDEN")).toBe(403);
  });

  it("never exposes a storage path in the browser view", () => {
    const { upload, ...rest } = media;
    void upload;
    expect(
      mediaItemViewSchema.safeParse({
        ...rest,
        signedUrl: null,
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      mediaItemViewSchema.safeParse({
        ...media,
        signedUrl: null,
        expiresAt: null,
      }).success,
    ).toBe(false);
  });
});
