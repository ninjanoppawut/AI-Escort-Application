import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("application landing page", () => {
  it("links to the implemented authentication flow", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /เปลี่ยนการสำรวจพืช/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Foundation · Phase 0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /เข้าสู่ระบบ/ })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });
});
