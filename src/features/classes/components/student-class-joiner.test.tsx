import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentClassJoiner } from "./student-class-joiner";

describe("StudentClassJoiner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits normalized invite codes and shows successful membership", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            class_id: "10000000-0000-4000-8000-000000000401",
            school_id: "10000000-0000-4000-8000-000000000402",
            role: "student",
            class_name: "Biology M.4",
            school_name: "Field School",
            already_joined: false,
            used_count: 1,
          },
          error: null,
          requestId: "10000000-0000-4000-8000-000000000403",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    render(<StudentClassJoiner />);
    await userEvent.type(screen.getByLabelText("รหัสชั้นเรียน"), "bio4-a7k9");
    await userEvent.click(
      screen.getByRole("button", { name: "เข้าร่วมชั้นเรียน" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/classes/join",
      expect.objectContaining({
        body: JSON.stringify({ inviteCode: "BIO4-A7K9" }),
        method: "POST",
      }),
    );
    expect(await screen.findByText("เข้าร่วมชั้นเรียนแล้ว")).toBeVisible();
    expect(screen.getByText("Biology M.4 · Field School")).toBeVisible();
  });

  it("auto-consumes link tokens and renders already-joined replay state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            class_id: "10000000-0000-4000-8000-000000000411",
            school_id: "10000000-0000-4000-8000-000000000412",
            role: "student",
            class_name: "Biology M.5",
            school_name: "Field School",
            already_joined: true,
            used_count: 1,
          },
          error: null,
          requestId: "10000000-0000-4000-8000-000000000413",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<StudentClassJoiner token="opaque-token-123" />);

    expect(await screen.findByText("คุณอยู่ในชั้นเรียนนี้แล้ว")).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/classes/join",
      expect.objectContaining({
        body: JSON.stringify({ token: "opaque-token-123" }),
      }),
    );
  });

  it("shows invalid invite failures with request IDs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "INVITE_EXPIRED",
            message: "คำเชิญหมดอายุ",
            retryable: false,
            details: {},
          },
          requestId: "10000000-0000-4000-8000-000000000423",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

    render(<StudentClassJoiner />);
    await userEvent.type(screen.getByLabelText("รหัสชั้นเรียน"), "BIO4-A7K9");
    await userEvent.click(
      screen.getByRole("button", { name: "เข้าร่วมชั้นเรียน" }),
    );

    expect(await screen.findByText("คำเชิญหมดอายุ")).toBeVisible();
    expect(
      screen.getByText("Request ID: 10000000-0000-4000-8000-000000000423"),
    ).toBeVisible();
  });
});
