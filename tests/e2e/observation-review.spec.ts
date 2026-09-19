import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { createExifJpegFixture } from "./support/image-fixtures";
import {
  expectNoHorizontalOverflow,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import {
  EVIDENCE,
  SMALL_VIEWPORT,
  STUDENT_VIEWPORT,
  addWholePlantImage,
  openFieldShell,
  setupField,
  signInContext,
  startObservation,
  studentContext,
} from "./support/observation-journey";

// P11-02 against the local stack at 390 px: with AI unavailable the owner
// chooses manual entry on a draft with a whole-plant image, saves an unknown
// scientific name (saved, but listed as a submit blocker), corrects it with
// trait checks and evidence, reviews, and submits once. A classmate is
// refused the review read model. The flow fits a 360 px screen.

test.describe("P11 manual review, submission, and related records", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("manual entry, blocker recovery, trait checks, review-before-submit, and single submission", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P11-02 journey runs once, at 390 px, against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const { adaEmail, cyEmail, password, activityId, sessionId } =
      await setupField(request, "review");

    const contexts: BrowserContext[] = [];
    try {
      const adaContext = await studentContext(browser, baseURL);
      contexts.push(adaContext);
      await signInContext(adaContext, adaEmail, password);
      const ada = await adaContext.newPage();
      await ada.goto(`/activities/${activityId}/sessions/${sessionId}`);
      await expect(
        ada.getByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      await ada
        .getByRole("region", { name: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง" })
        .getByRole("button", { name: "เริ่มแชร์ตำแหน่ง" })
        .click();

      const observationId = await startObservation(ada, adaContext);
      const reviewApi = `/api/observations/${observationId}/student-review`;
      await adaContext.request.get(reviewApi);

      // A whole-plant image is part of the evidence.
      const media = ada.getByRole("region", { name: /^ภาพหลักฐาน · / });
      const gallery = media.getByRole("button", { name: "เลือกจากคลัง" });
      await expect(gallery).toBeEnabled({ timeout: 120_000 });
      await media
        .locator('input[type="file"][data-media-input="gallery"]')
        .setInputFiles({
          name: "plant.jpg",
          mimeType: "image/jpeg",
          buffer: createExifJpegFixture(),
        });
      await expect(media.locator("[data-media-tile]").nth(0)).toHaveAttribute(
        "data-tile-state",
        "uploaded",
        { timeout: 120_000 },
      );

      // 1. AI is unavailable: the entry panel offers manual entry.
      const entry = ada.getByRole("region", { name: "AI ช่วยดูยังไม่เปิดใช้" });
      await expect(entry).toBeVisible({ timeout: 60_000 });
      await expect(entry).toHaveAttribute("data-analysis-state", "unavailable");
      await entry.getByRole("button", { name: "กรอกข้อมูลเอง" }).click();

      const form = ada.getByRole("region", { name: "กรอกข้อมูลพืชเอง" });
      await expect(form).toBeVisible();
      await form.getByLabel(/ชื่อไทยหรือชื่อทั่วไป/).fill("ชบา");
      await form.getByLabel(/ชื่อวิทยาศาสตร์/).fill("ไม่ทราบ");
      await expect(form).toContainText("บันทึกได้ แต่ส่งให้ครูไม่ได้");

      // 2. An unknown name saves but blocks submission.
      await form.getByRole("button", { name: "บันทึกข้อมูลพืช" }).click();
      await expect(form.locator("[data-review-save-state]")).toHaveAttribute(
        "data-review-save-state",
        "updated",
        { timeout: 60_000 },
      );
      const panel = ada.getByRole("region", { name: "สรุปก่อนส่ง" });
      const blockers = panel.getByRole("list", {
        name: "สิ่งที่ต้องทำก่อนส่ง",
      });
      await expect(blockers.locator("[data-blocker]")).toHaveCount(2, {
        timeout: 30_000,
      });
      await expect(
        blockers.locator('[data-blocker="scientific_name"]'),
      ).toBeVisible();
      await expect(
        blockers.locator('[data-blocker="evidence_note"]'),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "ส่งการสังเกต" }),
      ).toBeDisabled();
      expect(
        queryLocalSql(
          `select status || '|' || identity_source || '|' || student_scientific_name
           from public.observations where id = '${observationId}'::uuid;`,
        ),
      ).toBe("student_review|manual|ไม่ทราบ");

      // 3. Correct the name, check traits, write the evidence, and save.
      await form.getByLabel(/ชื่อวิทยาศาสตร์/).fill("Hibiscus rosa-sinensis");
      await form.locator('[data-trait-group="leaf"] > summary').click();
      const margin = form.getByRole("group", { name: "ขอบใบ" });
      await margin.getByText("✓ เห็นชัด").click();
      await form.getByLabel("ขอบใบที่เห็นจากต้นจริง").fill("หยักเฉพาะปลายใบ");
      await form
        .getByRole("group", { name: "เส้นใบ" })
        .getByText("◌ ไม่เห็น")
        .click();
      await form.getByLabel(/เหตุผลประกอบ/).fill(EVIDENCE);
      await expect(
        panel.getByRole("button", { name: "ส่งการสังเกต" }),
      ).toBeDisabled();
      await expect(panel).toContainText("บันทึกข้อมูลพืชก่อน");
      await form.getByRole("button", { name: "บันทึกข้อมูลพืช" }).click();
      await expect(panel).toContainText("ข้อมูลที่บันทึกไว้ครบ พร้อมส่ง", {
        timeout: 60_000,
      });
      expect(
        queryLocalSql(
          `select string_agg(trait_key || ':' || coalesce(student_status, 'value'), ',' order by position)
           from public.student_trait_verifications
           where observation_id = '${observationId}'::uuid;`,
        ),
      ).toBe("leaf_margin:value,leaf_venation:not_visible");

      await expectNoHorizontalOverflow(ada);
      await ada.setViewportSize(SMALL_VIEWPORT);
      await expectNoHorizontalOverflow(ada);
      await ada.setViewportSize(STUDENT_VIEWPORT);

      // 4. A classmate cannot read the owner's review.
      const cyContext = await studentContext(browser, baseURL);
      contexts.push(cyContext);
      await signInContext(cyContext, cyEmail, password);
      const denied = await cyContext.request.get(reviewApi);
      expect([403, 404]).toContain(denied.status());
      expect(await denied.text()).not.toContain("Hibiscus");

      // 5. Review before submit, then submit once.
      await panel.getByRole("button", { name: "ส่งการสังเกต" }).click();
      const dialog = ada.getByRole("alertdialog", {
        name: "ส่งการสังเกตนี้ให้ครู?",
      });
      await expect(dialog).toContainText("Hibiscus rosa-sinensis");
      await expect(dialog).toContainText(EVIDENCE.slice(0, 20));
      await dialog.getByRole("button", { name: "ยืนยันส่งให้ครู" }).click();

      const summary = ada.getByRole("region", { name: "ส่งให้ครูแล้ว" });
      await expect(summary).toBeVisible({ timeout: 60_000 });
      await expect(summary).toContainText("ส่งครั้งที่ 1 เรียบร้อย");
      await expect(form).toBeHidden();
      await expectNoHorizontalOverflow(ada);

      expect(
        queryLocalSql(
          `select observation.status || '|' || count(submission.id) || '|' ||
             max(submission.submission_number)
           from public.observations as observation
           left join public.observation_submissions as submission
             on submission.observation_id = observation.id
           where observation.id = '${observationId}'::uuid
           group by observation.status;`,
        ),
      ).toBe("submitted|1|1");

      // A reload shows the frozen submission, not an editable form.
      await ada.reload();
      await expect(
        ada.getByRole("region", { name: "ส่งให้ครูแล้ว (ครั้งที่ 1)" }),
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        ada.getByRole("region", { name: "กรอกข้อมูลพืชเอง" }),
      ).toHaveCount(0);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  // P11-04/P11-05: the owner's second hibiscus at the same spot warns, is
  // acknowledged, and submits; the teacher gets the notification and tag and
  // alone confirms the possible same specimen, and nothing is merged.
  test("same-species warning, teacher tag and notification, and teacher-only specimen confirmation", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P11-04/P11-05 journey runs once against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const { teacherEmail, adaEmail, cyEmail, password, activityId, sessionId } =
      await setupField(request, "species");
    const shellUrl = `/activities/${activityId}/sessions/${sessionId}`;
    const contexts: BrowserContext[] = [];

    try {
      const { context: adaContext, page: ada } = await openFieldShell(
        browser,
        baseURL,
        adaEmail,
        password,
        shellUrl,
      );
      contexts.push(adaContext);

      // 1. A first hibiscus is reviewed and submitted over the API.
      const firstId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      const first = (await (
        await adaContext.request.get(`/api/observations/${firstId}`)
      ).json()) as { data: { version: number } };
      const saved = await adaContext.request.put(
        `/api/observations/${firstId}/student-review`,
        {
          data: {
            expectedVersion: first.data.version,
            identitySource: "manual",
            commonName: "ชบา",
            scientificName: "Hibiscus rosa-sinensis",
            evidenceNote: EVIDENCE,
            referenceNote: null,
            traits: [],
          },
        },
      );
      expect(saved.status(), await saved.text()).toBe(200);
      const savedBody = (await saved.json()) as { data: { version: number } };
      const submitted = await adaContext.request.post(
        `/api/observations/${firstId}/submit`,
        {
          data: {
            clientSubmissionId: randomUUID(),
            expectedVersion: savedBody.data.version,
            acknowledgeSameSpecies: false,
          },
        },
      );
      expect(submitted.status(), await submitted.text()).toBe(201);

      // 2. A second hibiscus at the same spot warns before submitting.
      await ada.goto(shellUrl);
      const secondId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      await ada
        .getByRole("region", { name: "AI ช่วยดูยังไม่เปิดใช้" })
        .getByRole("button", { name: "กรอกข้อมูลเอง" })
        .click();
      const form = ada.getByRole("region", { name: "กรอกข้อมูลพืชเอง" });
      await form.getByLabel(/ชื่อไทยหรือชื่อทั่วไป/).fill("ชบา");
      await form.getByLabel(/ชื่อวิทยาศาสตร์/).fill("Hibiscus rosa-sinensis");
      await form.getByLabel(/เหตุผลประกอบ/).fill(EVIDENCE);
      await form.getByRole("button", { name: "บันทึกข้อมูลพืช" }).click();

      const panel = ada.getByRole("region", { name: "สรุปก่อนส่ง" });
      const warning = panel.locator('[data-same-species="warning"]');
      await expect(warning).toContainText(
        "พืชชนิดนี้ถูกบันทึกในรอบนี้แล้ว 1 รายการ",
        { timeout: 60_000 },
      );
      await expect(warning).toContainText("อาจเป็นต้นเดียวกัน 1 รายการ");
      const submit = panel.getByRole("button", { name: "ส่งการสังเกต" });
      await expect(submit).toBeDisabled();
      await warning.getByRole("checkbox", { name: /รับทราบ/ }).check();
      await expect(submit).toBeEnabled();
      await submit.click();
      await ada
        .getByRole("alertdialog", { name: "ส่งการสังเกตนี้ให้ครู?" })
        .getByRole("button", { name: "ยืนยันส่งให้ครู" })
        .click();
      await expect(
        ada.getByRole("region", { name: "ส่งให้ครูแล้ว" }),
      ).toContainText("ชนิดเดียวกันในรอบนี้ (รับทราบแล้ว)", {
        timeout: 60_000,
      });

      expect(
        queryLocalSql(
          `select count(*) from public.notifications
           where observation_id = '${secondId}'::uuid and type = 'same_species_warning'
             and recipient_id = (select id from public.profiles where email = ${sqlLiteral(teacherEmail)});`,
        ),
      ).toBe("1");
      expect(
        queryLocalSql(
          `select string_agg(relationship_type, ',' order by relationship_type)
           from public.observation_duplicate_candidates
           where observation_id = '${secondId}'::uuid;`,
        ),
      ).toBe("possible_same_specimen,same_species");

      // 3. A classmate cannot open the teacher view.
      const cyContext = await studentContext(browser, baseURL);
      contexts.push(cyContext);
      await signInContext(cyContext, cyEmail, password);
      const denied = await cyContext.request.get(`/api/reviews/${secondId}`);
      expect([403, 404]).toContain(denied.status());

      // 4. The teacher sees the tag and confirms the specimen relation.
      const teacherContext = await browser.newContext({
        baseURL,
        viewport: { width: 1280, height: 900 },
      });
      contexts.push(teacherContext);
      await signInContext(teacherContext, teacherEmail, password);
      const teacher = await teacherContext.newPage();
      await teacher.goto(`/teacher/reviews/${secondId}`);
      await expect(teacher.locator('[data-tag="same_species"]')).toContainText(
        "ชนิดซ้ำในรอบนี้ · อีก 1 รายการ",
        { timeout: 120_000 },
      );
      await expect(
        teacher.getByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
      ).toBeVisible();
      const specimen = teacher.locator(
        '[data-relation="possible_same_specimen"]',
      );
      await expect(specimen).toContainText("ยังไม่ได้ยืนยัน");
      await specimen.getByRole("button", { name: "ต้นเดียวกัน" }).click();
      await teacher
        .getByRole("alertdialog", { name: "ยืนยันว่าเป็น “ต้นเดียวกัน”?" })
        .getByRole("button", { name: "ยืนยัน" })
        .click();
      await expect(specimen).toHaveAttribute(
        "data-relation-decision",
        "same_specimen",
        { timeout: 60_000 },
      );

      // Nothing was merged, deleted, or rejected; opening the teacher view
      // only began the review of the second record (P12, D-067).
      expect(
        queryLocalSql(
          `select count(*) || '|' || string_agg(status, ',' order by status)
           from public.observations
           where id in ('${firstId}'::uuid, '${secondId}'::uuid);`,
        ),
      ).toBe("2|submitted,teacher_review");
      expect(
        queryLocalSql(
          `select teacher_decision from public.observation_duplicate_candidates
           where observation_id = '${secondId}'::uuid
             and relationship_type = 'possible_same_specimen';`,
        ),
      ).toBe("same_specimen");
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
