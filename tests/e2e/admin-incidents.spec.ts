import { expect, test } from "@playwright/test";

import { adminWithMfa } from "./support/admin";
import {
  expectNoHorizontalOverflow,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P15-05 against the local stack: an aal2 admin opens an incident,
// acknowledges it, appends a note whose first response is lost (the retry
// does not duplicate it), and closes it with a resolution.

test.describe("P15 incidents", () => {
  test.setTimeout(600_000);

  test("open, acknowledge, append a note once despite a lost response, resolve", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "P15 admin journey runs once, on the desktop project CI runs.",
    );
    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const {
      context,
      page: admin,
      suffix,
    } = await adminWithMfa(browser, request, baseURL, "incidents");
    try {
      const title = `Uploads failing ${suffix}`;
      await admin.goto("/admin/incidents");
      const open = admin.getByRole("form", { name: "เปิดเหตุการณ์" });
      await open.getByLabel("ชื่อเหตุการณ์").fill(title);
      await open.getByLabel("ความรุนแรง").selectOption("sev2");
      await open.getByLabel("ขั้นตอนที่ได้รับผลกระทบ").selectOption("upload");
      await open.getByRole("button", { name: "เปิดเหตุการณ์" }).click();
      await admin.waitForURL(/\/admin\/incidents\/[0-9a-f-]{36}$/, {
        timeout: 120_000,
      });
      const detail = admin.locator("div[data-incident-status]");
      await expect(detail).toHaveAttribute("data-incident-status", "open", {
        timeout: 60_000,
      });
      await expect(admin.getByRole("heading", { name: title })).toBeVisible();

      await admin.getByRole("button", { name: "รับทราบเหตุการณ์" }).click();
      // next dev compiles each route on first use.
      await expect(detail).toHaveAttribute(
        "data-incident-status",
        "acknowledged",
        { timeout: 120_000 },
      );

      // The first note response is lost after the server saved it.
      let dropped = false;
      await admin.route("**/api/admin/incidents/*/notes", async (route) => {
        if (dropped) return route.continue();
        dropped = true;
        await route.fetch();
        await route.abort("connectionfailed");
      });
      const notes = admin.getByRole("form", { name: "เพิ่มบันทึกเหตุการณ์" });
      await notes.getByLabel("บันทึกใหม่").fill("Storage 503 ตั้งแต่ 09:10");
      await notes.getByRole("button", { name: "เพิ่มบันทึก" }).click();
      await expect(notes.getByRole("alert")).toContainText(
        "ระบบจะไม่เพิ่มซ้ำ",
        { timeout: 120_000 },
      );
      await notes.getByRole("button", { name: "เพิ่มบันทึก" }).click();
      await expect(admin.locator("[data-incident-notes]")).toHaveAttribute(
        "data-incident-notes",
        "1",
        { timeout: 60_000 },
      );
      expect(
        await queryLocalSql(`
          select count(*) from public.operational_incident_notes as note
          join public.operational_incidents as incident on incident.id = note.incident_id
          where incident.title = ${sqlLiteral(title)};
        `),
      ).toBe("1");

      const resolve = admin.getByRole("form", { name: "ปิดเหตุการณ์" });
      await resolve
        .getByLabel("สิ่งที่แก้ไขและสาเหตุ")
        .fill("ผู้ให้บริการกลับมาปกติ ภาพที่ค้างส่งใหม่สำเร็จ");
      await resolve.getByRole("button", { name: "ปิดเหตุการณ์" }).click();
      await expect(detail).toHaveAttribute("data-incident-status", "resolved", {
        timeout: 60_000,
      });
      await expect(admin.locator("[data-incident-resolution]")).toContainText(
        "ผู้ให้บริการกลับมาปกติ",
      );
      await admin.setViewportSize({ width: 360, height: 800 });
      await expectNoHorizontalOverflow(admin);

      await admin.goto("/admin/incidents");
      await expect(
        admin.locator(`a[data-incident-status]`, { hasText: title }),
      ).toHaveCount(0, { timeout: 60_000 });
    } finally {
      await context.close();
    }
  });
});
