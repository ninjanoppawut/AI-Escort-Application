import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeacherClassManager } from "./teacher-class-manager";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,qr"),
  },
}));

const school = {
  id: "10000000-0000-4000-8000-000000000701",
  name: "Test School",
};

function envelope(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data, error: null, requestId: "request-id" }),
  } as Response;
}

function renderWithQuery(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("TeacherClassManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn() },
    });
  });

  it("creates a class, displays QR invite state, disables, and rotates with confirmation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        envelope({
          id: "40000000-0000-4000-8000-000000000701",
          school_id: school.id,
          name: "Biology M4",
          subject: "Biology",
          academic_year: "2569",
          semester: "2",
          description: null,
          min_group_size: 2,
          max_group_size: 4,
          maximum_groups: 5,
          allow_student_groups: true,
          group_formation_status: "open",
          status: "active",
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          id: "50000000-0000-4000-8000-000000000701",
          class_id: "40000000-0000-4000-8000-000000000701",
          code: "ABCD-1234",
          token: "token-one",
          join_url: "http://localhost:3000/join/token-one",
          expires_at: null,
          max_uses: null,
          used_count: 0,
          status: "active",
          disabled_at: null,
          created_at: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          invite_id: "50000000-0000-4000-8000-000000000701",
          status: "disabled",
          disabled_at: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          id: "50000000-0000-4000-8000-000000000702",
          class_id: "40000000-0000-4000-8000-000000000701",
          code: "WXYZ-9876",
          token: "token-two",
          join_url: "http://localhost:3000/join/token-two",
          expires_at: null,
          max_uses: null,
          used_count: 0,
          status: "active",
          disabled_at: null,
          created_at: new Date(Date.now() + 1000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          id: "50000000-0000-4000-8000-000000000703",
          class_id: "40000000-0000-4000-8000-000000000701",
          code: "LMNO-4567",
          token: "token-three",
          join_url: "http://localhost:3000/join/token-three",
          expires_at: null,
          max_uses: null,
          used_count: 0,
          status: "active",
          disabled_at: null,
          created_at: new Date(Date.now() + 2000).toISOString(),
          superseded_invite_id: "50000000-0000-4000-8000-000000000702",
        }),
      );

    renderWithQuery(
      <TeacherClassManager
        initialClasses={[]}
        initialInvites={[]}
        schools={[school]}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("ชื่อชั้นเรียน"),
      "Biology M4",
    );
    await userEvent.type(screen.getByPlaceholderText("วิชา"), "Biology");
    await userEvent.clear(screen.getByPlaceholderText("ขนาดต่ำสุด"));
    await userEvent.type(screen.getByPlaceholderText("ขนาดต่ำสุด"), "2");
    await userEvent.clear(screen.getByPlaceholderText("ขนาดสูงสุด"));
    await userEvent.type(screen.getByPlaceholderText("ขนาดสูงสุด"), "4");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1]!, "open");
    await userEvent.click(
      screen.getByRole("button", { name: "สร้างชั้นเรียน" }),
    );

    expect(
      await screen.findByText("สร้างชั้นเรียนและเพิ่มครูเป็นสมาชิกแล้ว"),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "สร้างคำเชิญ" }));
    expect(await screen.findByText("ABCD-1234")).toBeVisible();
    expect(await screen.findByAltText("QR invitation")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "ปิดคำเชิญ" }));
    expect(await screen.findByText("ปิดคำเชิญแล้ว")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "สร้างคำเชิญ" }));
    expect(await screen.findByText("WXYZ-9876")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "หมุนคำเชิญ" }));
    expect(await screen.findByText("LMNO-4567")).toBeVisible();
    expect(screen.getByText("หมุนคำเชิญและปิดคำเชิญเดิมแล้ว")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await waitFor(() =>
      expect(screen.getByAltText("QR invitation")).toHaveAttribute(
        "src",
        "data:image/png;base64,qr",
      ),
    );
  }, 20_000);
});
