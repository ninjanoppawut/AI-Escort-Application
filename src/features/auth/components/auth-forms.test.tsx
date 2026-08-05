import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInForm, SignUpForm } from "@/features/auth/components/auth-forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth forms", () => {
  it("offers student signup without a role control and preserves generic confirmation copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { confirmationRequired: true },
        error: null,
        requestId: "3d6f0a68-dce9-49b1-a4f4-c64af0f90f7b",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SignUpForm returnTo="/app" />);

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/บทบาท/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("อีเมล"), "Student@Example.EDU");
    await user.type(screen.getByLabelText("รหัสผ่าน"), "long passphrase 123");
    await user.type(
      screen.getByLabelText("ยืนยันรหัสผ่าน"),
      "long passphrase 123",
    );
    await user.click(
      screen.getByRole("button", { name: "สร้างบัญชีนักเรียน" }),
    );

    expect(await screen.findByText("ตรวจอีเมลเพื่อยืนยันบัญชี")).toBeVisible();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toEqual({
      email: "student@example.edu",
      password: "long passphrase 123",
      returnTo: "/app",
    });
  });

  it("shows the documented unconfirmed-email recovery action", () => {
    render(<SignInForm initialError="EMAIL_NOT_CONFIRMED" returnTo="/app" />);

    expect(screen.getByText("กรุณายืนยันอีเมล")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "ส่งอีเมลยืนยันอีกครั้ง" }),
    ).toHaveAttribute("href", "/auth/resend-confirmation");
  });
});
