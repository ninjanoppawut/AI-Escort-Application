import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  OBSERVATION_STATUSES,
  OBSERVATION_STATUS_LABELS,
  type ObservationStatus,
} from "../contracts";
import {
  OBSERVATION_STATUS_TOKENS,
  ObservationStatusBadge,
} from "./observation-status-badge";

// UI_CONTRACTS.md §2 observation table: shape per status.
const CONTRACT_SHAPES = {
  draft: "circle",
  images_uploading: "striped-circle",
  analysis_queued: "diamond",
  analysis_running: "diamond",
  student_review: "hexagon",
  submitted: "circle",
  teacher_review: "hexagon",
  revision_required: "triangle",
  resubmitted: "diamond",
  verified: "checked-circle",
  unable_to_verify: "square",
  rejected: "octagon",
} as const;

describe("ObservationStatusBadge", () => {
  it("covers all 12 statuses with the Thai label, an icon, and the contract shape", () => {
    expect(OBSERVATION_STATUSES).toHaveLength(12);
    expect(Object.keys(OBSERVATION_STATUS_TOKENS).sort()).toEqual(
      [...OBSERVATION_STATUSES].sort(),
    );

    for (const status of OBSERVATION_STATUSES) {
      const token = OBSERVATION_STATUS_TOKENS[status];
      expect(token.label).toBe(OBSERVATION_STATUS_LABELS[status]);
      expect(token.shape).toBe(CONTRACT_SHAPES[status]);

      const { container, unmount } = render(
        <ObservationStatusBadge status={status} />,
      );
      expect(screen.getByText(token.label)).toBeVisible();
      expect(container.firstElementChild).toHaveAttribute(
        "data-status",
        status,
      );
      expect(
        container.querySelector(`[data-shape="${token.shape}"]`),
      ).not.toBeNull();
      // Shape marker plus status icon, both decorative next to the label.
      const icons = container.querySelectorAll("svg");
      expect(icons).toHaveLength(2);
      for (const icon of icons) {
        expect(icon).toHaveAttribute("aria-hidden", "true");
      }
      unmount();
    }
  });

  it("keeps statuses that share a shape apart by icon and label", () => {
    const byShape = new Map<string, ObservationStatus[]>();
    for (const status of OBSERVATION_STATUSES) {
      const token = OBSERVATION_STATUS_TOKENS[status];
      byShape.set(token.shape, [...(byShape.get(token.shape) ?? []), status]);
    }
    for (const statuses of byShape.values()) {
      const icons = new Set(
        statuses.map((status) => OBSERVATION_STATUS_TOKENS[status].icon),
      );
      const labels = new Set(
        statuses.map((status) => OBSERVATION_STATUS_TOKENS[status].label),
      );
      expect(icons.size).toBe(statuses.length);
      expect(labels.size).toBe(statuses.length);
    }
  });
});
