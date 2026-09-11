import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { groupStatusSchema } from "../contracts";
import { GROUP_STATUS_TOKENS, GroupStatusBadge } from "./group-status-badge";

describe("GroupStatusBadge", () => {
  it("covers every group status with Thai text, an icon, and a distinct shape", () => {
    const statuses = groupStatusSchema.options;
    expect(Object.keys(GROUP_STATUS_TOKENS).sort()).toEqual(
      [...statuses].sort(),
    );
    expect(
      new Set(statuses.map((status) => GROUP_STATUS_TOKENS[status].shape)).size,
    ).toBe(statuses.length);

    for (const status of statuses) {
      const { container, unmount } = render(
        <GroupStatusBadge status={status} />,
      );
      const token = GROUP_STATUS_TOKENS[status];
      expect(screen.getByText(token.label)).toBeVisible();
      expect(
        container.querySelector(`[data-shape="${token.shape}"]`),
      ).not.toBeNull();
      expect(container.querySelectorAll("svg")).toHaveLength(2);
      unmount();
    }
  });
});
