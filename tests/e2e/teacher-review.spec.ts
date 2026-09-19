import { expect, test, type BrowserContext } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import {
  SMALL_VIEWPORT,
  STUDENT_VIEWPORT,
  addWholePlantImage,
  openFieldShell,
  setupField,
  signInContext,
  startObservation,
  studentContext,
  submitViaApi,
  teacherContext,
} from "./support/observation-journey";

// P12 against the local stack: the teacher opens the class queue, begins the
// review, and requests a targeted revision; the student sees the outcome,
// edits only the open topic, asks for one more, and the teacher grants it
// from the deep link; the student resubmits the same observation and the
// teacher verifies version 2 with a correction while every earlier value
// stays. A classmate's report is anonymous to the owner, rate limited, and
// resolved by the teacher. The revision screen fits 360 px.

test.describe("P12 teacher review and revision", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("queue, targeted revision, additional topic, resubmission, verify with correction, and anonymous report", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P12 journey runs once against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const field = await setupField(request, "p12");
    const shellUrl = `/activities/${field.activityId}/sessions/${field.sessionId}`;
    const contexts: BrowserContext[] = [];

    try {
      // 1. Ada submits a hibiscus.
      const { context: adaContext, page: ada } = await openFieldShell(
        browser,
        baseURL,
        field.adaEmail,
        field.password,
        shellUrl,
      );
      contexts.push(adaContext);
      const observationId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      await submitViaApi(adaContext, observationId, {
        commonName: "ชบา",
        scientificName: "Hibiscus rosa-sinensis",
      });

      // 2. The teacher finds it in the class queue and requests a revision.
      const tamContext = await teacherContext(browser, baseURL);
      contexts.push(tamContext);
      await signInContext(tamContext, field.teacherEmail, field.password);
      const tam = await tamContext.newPage();
      await tam.goto(`/teacher/classes/${field.classId}/reviews`);
      const item = tam.locator(`[data-queue-item="${observationId}"]`);
      await expect(item).toContainText("Hibiscus rosa-sinensis", {
        timeout: 120_000,
      });
      await item.click();
      await tam.waitForURL(new RegExp(`/teacher/reviews/${observationId}$`));
      await expect(tam.locator("[data-decision-panel]")).toBeVisible({
        timeout: 120_000,
      });
      await expect
        .poll(() =>
          queryLocalSql(
            `select status from public.observations where id = '${observationId}'::uuid;`,
          ),
        )
        .toBe("teacher_review");

      await tam.getByRole("button", { name: "ขอให้แก้ไข" }).click();
      const revisionDialog = tam.getByRole("dialog", { name: "ขอให้แก้ไข" });
      await revisionDialog
        .getByRole("button", { name: "ส่งคำขอแก้ไข" })
        .click();
      await expect(revisionDialog).toContainText("เลือกอย่างน้อย 1 หัวข้อ");
      await revisionDialog.getByLabel("ชื่อวิทยาศาสตร์").check();
      await revisionDialog
        .getByLabel(/คำแนะนำถึงนักเรียน/)
        .fill("ตรวจชื่อวิทยาศาสตร์อีกครั้ง กลีบดอกแฉกลึก");
      await revisionDialog
        .getByRole("button", { name: "ส่งคำขอแก้ไข" })
        .click();
      await expect(tam.locator("[data-decision-panel]")).toHaveCount(0, {
        timeout: 60_000,
      });
      await expect(
        tam.locator('[data-review-decision="revision_required"]'),
      ).toBeVisible();

      // 3. Ada sees the outcome and edits only the open topic.
      await ada.goto(`/observations/${observationId}`);
      const outcome = ada.locator('[data-review-outcome="revision_required"]');
      await expect(outcome).toContainText("ตรวจชื่อวิทยาศาสตร์อีกครั้ง", {
        timeout: 120_000,
      });
      await outcome.getByRole("link", { name: "เริ่มแก้ไข" }).click();
      await ada.waitForURL(
        new RegExp(`/observations/${observationId}/revision$`),
      );
      const form = ada.getByRole("region", { name: "แก้ไขและส่งใหม่" });
      await expect(form).toBeVisible({ timeout: 120_000 });
      await expect(form.getByLabel(/ชื่อไทยหรือชื่อทั่วไป/)).toHaveAttribute(
        "readonly",
        "",
      );
      await form.getByLabel(/ชื่อวิทยาศาสตร์/).fill("Hibiscus schizopetalus");
      await form.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
      const resubmit = ada.getByRole("region", { name: "ส่งฉบับแก้ไข" });
      await expect(resubmit).toContainText("ที่แก้แล้ว: ชื่อวิทยาศาสตร์", {
        timeout: 60_000,
      });

      await ada.setViewportSize(SMALL_VIEWPORT);
      await expectNoHorizontalOverflow(ada);
      await ada.setViewportSize(STUDENT_VIEWPORT);

      // 4. Ada asks to change the common name as well.
      const unlock = ada.getByRole("region", { name: "ขอแก้เพิ่ม" });
      await unlock
        .getByRole("checkbox", { name: "ชื่อไทยหรือชื่อทั่วไป" })
        .check();
      await unlock.getByLabel("เหตุผลถึงครู").fill("พบชื่อท้องถิ่นว่าพู่ระหง");
      await unlock.getByRole("button", { name: "ส่งคำขอแก้เพิ่ม" }).click();
      await expect(unlock).toContainText("รอครูตัดสิน", { timeout: 60_000 });
      const requestId = queryLocalSql(
        `select id from public.observation_unlock_requests where observation_id = '${observationId}'::uuid;`,
      );
      expect(
        queryLocalSql(
          `select count(*) from public.notifications
           where type = 'revision_access_requested' and request_id = '${requestId}'::uuid
             and recipient_id = (select id from public.profiles where email = ${sqlLiteral(field.teacherEmail)});`,
        ),
      ).toBe("1");

      // 5. The teacher grants it from the notification deep link.
      await tam.goto(
        `/teacher/reviews/${observationId}/unlock-requests/${requestId}`,
      );
      const pending = tam.locator('[data-unlock-request="pending"]');
      await expect(pending).toBeVisible({ timeout: 120_000 });
      await pending
        .getByRole("button", { name: "อนุญาต", exact: true })
        .click();
      await expect(tam.locator('[data-unlock-request="granted"]')).toBeVisible({
        timeout: 60_000,
      });

      // 6. Ada changes the common name and resubmits once.
      await ada.reload();
      await expect(
        form.getByLabel(/ชื่อไทยหรือชื่อทั่วไป/),
      ).not.toHaveAttribute("readonly", { timeout: 120_000 });
      // Type only after hydration, so the form owns the field.
      await ada.waitForLoadState("networkidle");
      const commonName = form.getByLabel(/ชื่อไทยหรือชื่อทั่วไป/);
      await expect(async () => {
        await commonName.fill("พู่ระหง");
        await expect(commonName).toHaveValue("พู่ระหง", { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await form.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
      await expect(resubmit).toContainText(
        "ที่แก้แล้ว: ชื่อไทยหรือชื่อทั่วไป · ชื่อวิทยาศาสตร์",
        { timeout: 60_000 },
      );
      await resubmit.getByRole("button", { name: "ส่งใหม่" }).click();
      await ada.getByRole("button", { name: "ยืนยันส่งใหม่" }).click();
      await expect(ada.locator("[data-revision-closed]")).toContainText(
        "ส่งฉบับแก้ไขแล้ว",
        { timeout: 60_000 },
      );
      expect(
        queryLocalSql(
          `select status || '|' || submission_count from public.observations where id = '${observationId}'::uuid;`,
        ),
      ).toBe("resubmitted|2");

      // 7. The teacher verifies version 2 with a correction.
      await tam.goto(`/teacher/reviews/${observationId}`);
      await expect(
        tam.getByRole("heading", { name: "ผลการตรวจ · ฉบับที่ 2" }),
      ).toBeVisible({
        timeout: 120_000,
      });
      await tam.getByRole("button", { name: "แก้แล้วรับรอง" }).click();
      const correct = tam.getByRole("dialog", { name: "แก้ไขและรับรอง" });
      await expect(
        correct.getByLabel("ชื่อไทยหรือชื่อทั่วไปที่ถูกต้อง"),
      ).toHaveValue("พู่ระหง");
      await correct.getByText("แก้ลักษณะ (ถ้ามี)").click();
      await correct.getByLabel("ขอบใบ").fill("หยักฟันเลื่อย");
      await correct.getByRole("button", { name: "บันทึกและรับรอง" }).click();
      await expect(tam.locator("[data-verified-identity]")).toContainText(
        "พู่ระหง",
        { timeout: 60_000 },
      );

      expect(
        queryLocalSql(
          `select observation.status || '|' || observation.verified_scientific_name || '|' ||
             (select count(*) from public.observation_submissions where observation_id = observation.id) || '|' ||
             (select string_agg(decision, ',' order by reviewed_at) from public.teacher_reviews where observation_id = observation.id) || '|' ||
             (select scientific_name from public.observation_submissions where observation_id = observation.id and submission_number = 1)
           from public.observations as observation where observation.id = '${observationId}'::uuid;`,
        ),
      ).toBe(
        "verified|Hibiscus schizopetalus|2|revision_required,verified|Hibiscus rosa-sinensis",
      );

      // 8. Ada sees the verified identity beside her own values.
      await ada.goto(`/observations/${observationId}`);
      const verified = ada.locator('[data-review-outcome="verified"]');
      await expect(verified).toContainText("ครูยืนยันแล้ว", {
        timeout: 120_000,
      });
      await expect(verified).toContainText("ครูแก้ลักษณะ ขอบใบ");

      // 9. Cy reports the record: anonymous to Ada, limited to once a day.
      const cyContext = await studentContext(browser, baseURL);
      contexts.push(cyContext);
      await signInContext(cyContext, field.cyEmail, field.password);
      const report = await cyContext.request.post(
        `/api/observations/${observationId}/report`,
        { data: { type: "identity", reason: "ชื่อพืชอาจไม่ตรงกับรูปที่ถ่าย" } },
      );
      expect(report.status(), await report.text()).toBe(201);
      const reportId = ((await report.json()) as { data: { reportId: string } })
        .data.reportId;
      const again = await cyContext.request.post(
        `/api/observations/${observationId}/report`,
        { data: { type: "image", reason: "ภาพไม่ตรงกับพืชที่บันทึกไว้" } },
      );
      expect(again.status()).toBe(429);
      expect(Number(again.headers()["retry-after"])).toBeGreaterThan(86_000);

      const ownerRead = await adaContext.request.get(
        `/api/reports/${reportId}`,
      );
      expect([403, 404]).toContain(ownerRead.status());
      expect(await ownerRead.text()).not.toContain("Cy Leader");
      const ownerView = await adaContext.request.get(
        `/api/observations/${observationId}/revision`,
      );
      expect(await ownerView.text()).not.toContain("Cy Leader");

      await tam.goto(`/teacher/reports/${reportId}`);
      await expect(tam.locator('[data-report-status="open"]')).toContainText(
        "รายงานโดย Cy Leader",
        { timeout: 120_000 },
      );
      await tam.getByRole("button", { name: "แก้ไขแล้ว" }).click();
      await expect(tam.locator('[data-report-status="resolved"]')).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
