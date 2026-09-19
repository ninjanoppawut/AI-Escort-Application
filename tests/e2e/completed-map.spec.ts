import { expect, test, type BrowserContext } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  queryLocalSql,
} from "./support/local-supabase";
import {
  SMALL_VIEWPORT,
  addWholePlantImage,
  openFieldShell,
  setupField,
  signInContext,
  startObservation,
  studentContext,
  submitViaApi,
  teacherContext,
} from "./support/observation-journey";

// P13 against the local stack: Ada submits a hibiscus (verified) and a second
// record (rejected); before completion Cy's map waits; the teacher completes
// the session and opens the completed map with both records and the review
// link; Cy (Root, in the session snapshot) sees the verified marker at its
// capture location but not Ada's rejected record, opens the detail with the
// submitted image and no teacher feedback, and reports it; Ada still sees
// her own rejected record. The map fits 360 px and no live location is sent.

test.describe("P13 completed activity map", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);
  test.use({ actionTimeout: 60_000 });

  test("teacher and participants open the completed map and plant details without live locations", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P13 journey runs once against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const field = await setupField(request, "map");
    const shellUrl = `/activities/${field.activityId}/sessions/${field.sessionId}`;
    const mapUrl = `/sessions/${field.sessionId}/map`;
    const contexts: BrowserContext[] = [];

    try {
      const { context: adaContext, page: ada } = await openFieldShell(
        browser,
        baseURL,
        field.adaEmail,
        field.password,
        shellUrl,
      );
      contexts.push(adaContext);
      const verifiedId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      await submitViaApi(adaContext, verifiedId, {
        commonName: "ชบา",
        scientificName: "Hibiscus rosa-sinensis",
      });
      await ada.goto(shellUrl);
      const rejectedId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      await submitViaApi(adaContext, rejectedId, {
        commonName: "เข็ม",
        scientificName: "Ixora coccinea",
      });

      const tamContext = await teacherContext(browser, baseURL);
      contexts.push(tamContext);
      await signInContext(tamContext, field.teacherEmail, field.password);
      const decide = async (
        observationId: string,
        body: Record<string, unknown>,
      ) => {
        const submissionId = queryLocalSql(
          `select id from public.observation_submissions where observation_id = '${observationId}'::uuid;`,
        );
        const response = await tamContext.request.post(
          `/api/observations/${observationId}/review`,
          { data: { submissionId, ...body } },
        );
        expect(response.status(), await response.text()).toBe(201);
      };
      await decide(verifiedId, {
        decision: "verified",
        feedback: "ดีมาก ถ่ายดอกชัด",
      });
      await decide(rejectedId, {
        decision: "rejected",
        feedback: "ภาพไม่ใช่ต้นที่บันทึก",
      });

      // Before completion the participant's map waits.
      const cyContext = await studentContext(browser, baseURL);
      contexts.push(cyContext);
      await signInContext(cyContext, field.cyEmail, field.password);
      const cy = await cyContext.newPage();
      const liveRequests: string[] = [];
      cy.on("request", (sent) => {
        if (/live-locations|location_events|\/locations/.test(sent.url())) {
          liveRequests.push(sent.url());
        }
      });
      await cy.goto(mapUrl);
      await expect(cy.getByText("แผนที่ผลลัพธ์ยังไม่เปิด")).toBeVisible({
        timeout: 120_000,
      });

      // The teacher completes the session and sees every record.
      const completed = await tamContext.request.post(
        `/api/sessions/${field.sessionId}/complete`,
        { data: {} },
      );
      expect(completed.status(), await completed.text()).toBe(200);
      const tam = await tamContext.newPage();
      await tam.goto(mapUrl);
      await expect(
        tam.getByRole("heading", { name: "ผลการสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      await expect(tam.locator("[data-map-marker]")).toHaveCount(2);
      await expect(
        tam.locator(`[data-map-marker="${rejectedId}"]`),
      ).toHaveAttribute("data-marker-shape", "octagon");
      // Markers are keyboard buttons on the sketch.
      await tam.locator(`[data-map-marker="${verifiedId}"]`).focus();
      await tam.keyboard.press("Enter");
      await expect(
        tam
          .getByRole("complementary", { name: "รายละเอียดพืช" })
          .getByRole("link", { name: "เปิดหน้าตรวจ" }),
      ).toHaveAttribute("href", `/teacher/reviews/${verifiedId}`, {
        timeout: 120_000,
      });

      // Cy sees the verified record only, with its image and no feedback.
      await cy.reload();
      await expect(
        cy.getByRole("heading", { name: "พรรณไม้ที่สำรวจได้" }),
      ).toBeVisible({ timeout: 120_000 });
      const markers = cy.locator("[data-map-marker]");
      await expect(markers).toHaveCount(1);
      const marker = cy.locator(`[data-map-marker="${verifiedId}"]`);
      await expect(marker).toHaveAttribute(
        "data-marker-shape",
        "checked-circle",
      );
      await expect(marker).toHaveAttribute(
        "aria-label",
        /ชบา · ครูยืนยันแล้ว · บันทึกโดย Ada Leader/,
      );
      await expectNoHorizontalOverflow(cy);
      await cy.setViewportSize(SMALL_VIEWPORT);
      await expectNoHorizontalOverflow(cy);

      await marker.focus();
      await cy.keyboard.press("Enter");
      const panel = cy.getByRole("complementary", { name: "รายละเอียดพืช" });
      await expect(
        panel.getByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
      ).toBeVisible({
        timeout: 60_000,
      });
      await expect(panel).toContainText("13.7551");
      await expect(panel).not.toContainText("ดีมาก ถ่ายดอกชัด");
      await expect(cy.locator("[data-completed-map]")).toBeVisible();

      const hidden = await cyContext.request.get(
        `/api/observations/${rejectedId}/map-detail`,
      );
      expect([403, 404]).toContain(hidden.status());

      await panel.getByRole("button", { name: "รายงานปัญหา" }).click();
      const sheet = cy.getByRole("dialog", { name: "รายงานปัญหาของรายการ" });
      await sheet.getByLabel("ภาพไม่ตรงกับพืช").check();
      await sheet.getByLabel("รายละเอียด").fill("ภาพดูเหมือนเป็นต้นอื่นในแปลง");
      await sheet.getByRole("button", { name: "ส่งรายงาน" }).click();
      await expect(sheet).toContainText("ส่งรายงานให้ครูแล้ว", {
        timeout: 60_000,
      });
      expect(liveRequests).toEqual([]);

      // Ada still sees her own rejected record and the feedback on it.
      await ada.goto(mapUrl);
      await expect(ada.locator("[data-map-marker]")).toHaveCount(2, {
        timeout: 120_000,
      });
      await ada
        .locator(`[data-map-marker="${rejectedId}"]`)
        .click({ timeout: 20_000 });
      await expect(
        ada.getByRole("complementary", { name: "รายละเอียดพืช" }),
      ).toContainText("ภาพไม่ใช่ต้นที่บันทึก", { timeout: 60_000 });
      await expect(
        ada
          .getByRole("complementary", { name: "รายละเอียดพืช" })
          .getByRole("button", { name: "รายงานปัญหา" }),
      ).toHaveCount(0);

      expect(
        queryLocalSql(
          `select count(*) from public.observation_issue_reports where observation_id = '${verifiedId}'::uuid;`,
        ),
      ).toBe("1");
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
