import { expect, test } from "@playwright/test";

test("renders the mobile-first Phase 0 shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /เปลี่ยนการสำรวจพืช/ }),
  ).toBeVisible();
  await expect(page.getByText("Foundation · Phase 0")).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("returns a correlated liveness envelope", async ({ request }) => {
  const response = await request.get("/api/health/live");
  const body = await response.json();

  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-request-id"]).toBe(body.requestId);
  expect(body).toMatchObject({
    data: { status: "live" },
    error: null,
  });
});

test("reports ready when validated service configuration is present", async ({
  request,
}) => {
  const expectedEnvironment = process.env.NEXT_PUBLIC_APP_ENV ?? "local";
  const response = await request.get("/api/health/ready");
  const body = await response.json();

  expect(response.ok()).toBe(true);
  expect(body).toMatchObject({
    data: {
      status: "ready",
      environment: expectedEnvironment,
    },
    error: null,
  });
});
