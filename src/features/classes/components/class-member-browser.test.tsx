import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { AuthorizedClassSummary } from "../contracts";
import { ClassMemberBrowser } from "./class-member-browser";

const activeClass: AuthorizedClassSummary = {
  id: "20000000-0000-4000-8000-000000000501",
  class_id: "20000000-0000-4000-8000-000000000501",
  school_id: "10000000-0000-4000-8000-000000000501",
  school_name: "Field School",
  name: "Biology M.4",
  subject: "Biology",
  academic_year: "2569",
  semester: "1",
  description: null,
  min_group_size: 2,
  max_group_size: 4,
  maximum_groups: 4,
  allow_student_groups: true,
  group_formation_status: "open",
  status: "active",
  caller_role: "student",
  active_member_count: 2,
  created_at: "2026-08-06T01:00:00Z",
};

function renderWithQuery(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("ClassMemberBrowser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders student classmates without exposing emails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: "40000000-0000-4000-8000-000000000501",
                member_id: "40000000-0000-4000-8000-000000000501",
                class_id: activeClass.id,
                user_id: "00000000-0000-4000-8000-000000000501",
                display_name: "Ada Student",
                email: null,
                role: "student",
                status: "active",
                joined_at: "2026-08-06T01:00:00Z",
                left_at: null,
                current_group_id: null,
                current_group_name: null,
              },
            ],
            nextCursor: null,
            hasMore: false,
          },
          error: null,
          requestId: "10000000-0000-4000-8000-000000000501",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    renderWithQuery(
      <ClassMemberBrowser initialClasses={[activeClass]} mode="student" />,
    );

    expect(await screen.findByText("Ada Student")).toBeVisible();
    expect(screen.queryByText(/@example\.edu/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/classes/${activeClass.id}/members?status=active&limit=50&role=student`,
      ),
    );
  });

  it("renders teacher email fields and load-more pagination", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "40000000-0000-4000-8000-000000000501",
                  member_id: "40000000-0000-4000-8000-000000000501",
                  class_id: activeClass.id,
                  user_id: "00000000-0000-4000-8000-000000000501",
                  display_name: "Ada Student",
                  email: "ada@example.edu",
                  role: "student",
                  status: "active",
                  joined_at: "2026-08-06T01:00:00Z",
                  left_at: null,
                  current_group_id: null,
                  current_group_name: null,
                },
              ],
              nextCursor: "next-page",
              hasMore: true,
            },
            error: null,
            requestId: "10000000-0000-4000-8000-000000000502",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [],
              nextCursor: null,
              hasMore: false,
            },
            error: null,
            requestId: "10000000-0000-4000-8000-000000000503",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    renderWithQuery(
      <ClassMemberBrowser
        initialClasses={[{ ...activeClass, caller_role: "teacher" }]}
        mode="teacher"
      />,
    );

    expect(await screen.findByText("ada@example.edu")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /โหลดสมาชิก/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/classes/${activeClass.id}/members?status=active&limit=50&cursor=next-page`,
      ),
    );
  });

  it("renders empty and inactive states explicitly", () => {
    const archivedClass: AuthorizedClassSummary = {
      ...activeClass,
      id: "20000000-0000-4000-8000-000000000599",
      class_id: "20000000-0000-4000-8000-000000000599",
      name: "Archived Biology",
      status: "archived",
    };

    renderWithQuery(<ClassMemberBrowser initialClasses={[]} mode="student" />);
    expect(screen.getByText(/ยังไม่มีชั้นเรียนที่เข้าร่วมอยู่/)).toBeVisible();

    renderWithQuery(
      <ClassMemberBrowser initialClasses={[archivedClass]} mode="teacher" />,
    );
    expect(screen.getByText(/ชั้นเรียนนี้ปิดใช้งานแล้ว/)).toBeVisible();
  });
});
