import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { adminWithMfa } from "./support/admin";
import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import { signInContext } from "./support/observation-journey";

// P15-03/P15-04 against the local stack: a signed-in student's browser
// reports a Storage upload failure with a signed URL and free text in its
// context; flow health shows the failing flow and stage, the error explorer
// finds the event by request ID with only redacted context, and the audit
// explorer lists the admin's own audited reads.

test.describe("P15 flow health and explorers", () => {
  test.setTimeout(600_000);

  test("reported failure appears in health and the explorers, redacted", async ({
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
    const env = getLocalSupabaseEnv();
    const contexts: BrowserContext[] = [];
    try {
      const {
        context,
        page: admin,
        email: adminEmail,
        suffix,
      } = await adminWithMfa(browser, request, baseURL, "operations");
      contexts.push(context);

      // 1. A student's browser reports a failed upload.
      const studentEmail = `p15-ops-student-${suffix}@example.edu`;
      const password = "operations student passphrase 1";
      await createConfirmedUser(request, env, studentEmail, password);
      const studentContext = await browser.newContext({ baseURL });
      contexts.push(studentContext);
      await signInContext(studentContext, studentEmail, password);
      const requestId = randomUUID();
      const reported = await studentContext.request.post(
        "/api/telemetry/errors",
        {
          data: {
            flow: "upload",
            stage: "upload_failed",
            code: "IMAGE_UPLOAD_INCOMPLETE",
            severity: "error",
            requestId,
            context: { http_status: 503, attempt: 3, category: "network" },
          },
        },
      );
      expect(reported.status()).toBe(204);
      // Unknown context keys are refused before they reach the database.
      const refused = await studentContext.request.post(
        "/api/telemetry/errors",
        {
          data: {
            flow: "upload",
            stage: "upload_failed",
            code: "IMAGE_UPLOAD_INCOMPLETE",
            severity: "error",
            context: { signed_url: "https://example.test/sign?token=x" },
          },
        },
      );
      expect(refused.status()).toBe(204);
      expect(
        await queryLocalSql(`
          select count(*) || '|' || coalesce(string_agg(redacted_context::text, ','), '')
          from public.operational_error_events
          where actor_id = (select id from public.profiles where email = ${sqlLiteral(studentEmail)});
        `),
      ).toBe('1|{"attempt": 3, "category": "network", "http_status": 503}');

      // 2. Flow health shows the failing flow.
      await admin.goto("/admin/health");
      const upload = admin.locator('[data-flow="upload"]');
      await expect(upload).toHaveAttribute("data-flow-state", "critical", {
        timeout: 60_000,
      });
      await expect(upload).toContainText(
        "upload_failed/IMAGE_UPLOAD_INCOMPLETE",
      );
      await expect(admin.locator('[data-flow="ai"]')).toHaveAttribute(
        "data-flow-state",
        "partial",
      );
      await expect(admin.locator("[data-health-fresh]")).toContainText(
        "ข้อมูล ณ",
      );

      // 3. The error explorer, opened from the flow card, finds it by request.
      await upload
        .getByRole("link", { name: "ดูข้อผิดพลาดของขั้นตอนนี้" })
        .click();
      await admin.waitForURL(/\/admin\/errors\?flow=upload$/);
      const filters = admin.getByRole("form", { name: "ตัวกรองข้อผิดพลาด" });
      await expect(filters.getByLabel("ขั้นตอน")).toHaveValue("upload");
      await filters.getByLabel("Request ID").fill(requestId);
      await filters.getByRole("button", { name: "ค้นหา" }).click();
      const event = admin.locator(
        '[data-error-code="IMAGE_UPLOAD_INCOMPLETE"]',
      );
      await expect(event).toHaveCount(1, { timeout: 60_000 });
      await event.locator("summary").click();
      await expect(event).toContainText(requestId);
      await expect(event).toContainText('"http_status": 503');
      await expect(event).not.toContainText("signed_url");
      await expect(event).not.toContainText(studentEmail);

      await filters.getByLabel("Request ID").fill("not-a-uuid");
      await filters.getByRole("button", { name: "ค้นหา" }).click();
      await expect(filters.getByRole("alert")).toContainText(
        "ตัวกรองไม่ถูกต้อง",
      );

      // 4. The audit explorer lists the admin's own audited reads.
      await admin.goto("/admin/audit");
      const auditFilters = admin.getByRole("form", {
        name: "ตัวกรองบันทึกการใช้งาน",
      });
      await auditFilters.getByLabel("การกระทำ").fill("admin.health");
      await auditFilters.getByRole("button", { name: "ค้นหา" }).click();
      await expect(
        admin.locator('[data-audit-action="admin.health.viewed"]').first(),
      ).toBeVisible({ timeout: 60_000 });
      await admin.setViewportSize({ width: 360, height: 800 });
      await expectNoHorizontalOverflow(admin);

      expect(
        Number(
          await queryLocalSql(`
            select count(distinct action) from public.audit_logs
            where actor_id = (select id from public.profiles where email = ${sqlLiteral(adminEmail)})
              and action in ('admin.health.viewed', 'admin.errors.listed', 'admin.audit.listed');
          `),
        ),
      ).toBe(3);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
