import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { createExifJpegFixture } from "./support/image-fixtures";
import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P11-02 against the local stack at 390 px: with AI unavailable the owner
// chooses manual entry on a draft with a whole-plant image, saves an unknown
// scientific name (saved, but listed as a submit blocker), corrects it with
// trait checks and evidence, reviews, and submits once. A classmate is
// refused the review read model. The flow fits a 360 px screen.

const STUDENT_VIEWPORT = { width: 390, height: 844 };
const SMALL_VIEWPORT = { width: 360, height: 800 };
const DRAFT_URL = /\/observations\/[0-9a-f-]{36}$/;
const EVIDENCE =
  "ขอบใบเรียบช่วงโคน หยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง กลีบ 5 กลีบ เกสรยื่นยาว";

function asUserSql(userEmail: string, statement: string) {
  return `
    select set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', (select id from public.profiles where email = ${sqlLiteral(userEmail)}),
        'role', 'authenticated',
        'aal', 'aal1'
      )::text,
      false
    );
    ${statement}
    select set_config('request.jwt.claims', '', false);
  `;
}

async function signInContext(
  context: BrowserContext,
  email: string,
  password: string,
) {
  const response = await context.request.post("/api/auth/sign-in", {
    data: { email, password, returnTo: "/app" },
  });
  expect(response.status(), `sign-in failed: ${await response.text()}`).toBe(
    200,
  );
}

async function studentContext(browser: Browser, baseURL: string) {
  return browser.newContext({
    baseURL,
    viewport: STUDENT_VIEWPORT,
    permissions: ["geolocation"],
    geolocation: { latitude: 13.7551, longitude: 100.5051, accuracy: 8 },
  });
}

async function startObservation(page: Page, context: BrowserContext) {
  const start = page.getByRole("button", { name: "เพิ่มการสังเกต" });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มการสังเกต" });
  await expect(sheet).toBeVisible();
  // Emulated geolocation only emits when the override changes.
  await context.setGeolocation({
    latitude: 13.7551,
    longitude: 100.5051,
    accuracy: 7.6,
  });
  await expect(sheet).toContainText("±8 ม.", { timeout: 30_000 });
  await sheet.getByRole("button", { name: "ใช้ตำแหน่งนี้" }).click();
  await page.waitForURL(DRAFT_URL, { timeout: 120_000 });
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

interface Field {
  teacherEmail: string;
  adaEmail: string;
  cyEmail: string;
  password: string;
  classId: string;
  activityId: string;
  sessionId: string;
}

/** A class, two single-student groups, and an open session with Leaf active. */
async function setupField(
  request: APIRequestContext,
  label: string,
): Promise<Field> {
  const env = getLocalSupabaseEnv();
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const teacherEmail = `p11-${label}-teacher-${suffix}@example.edu`;
  const adaEmail = `p11-${label}-ada-${suffix}@example.edu`;
  const cyEmail = `p11-${label}-cy-${suffix}@example.edu`;
  const emails = [teacherEmail, adaEmail, cyEmail];
  const emailList = emails.map(sqlLiteral).join(", ");
  const password = "observation review passphrase 1";
  const schoolId = randomUUID();
  const classId = randomUUID();
  const activityId = randomUUID();
  const versionId = randomUUID();

  for (const email of emails) {
    await createConfirmedUser(request, env, email, password);
  }

  runLocalSql(`
      update public.profiles set email_verified_at = now() where email in (${emailList});
      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (select id from public.profiles where email in (${emailList}));

      update public.profiles set account_type = 'teacher', display_name = 'Teacher Tam'
      where email = ${sqlLiteral(teacherEmail)};
      update public.profiles set display_name = 'Ada Leader' where email = ${sqlLiteral(adaEmail)};
      update public.profiles set display_name = 'Cy Leader' where email = ${sqlLiteral(cyEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Review School', id from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Review Class', 1, 4, 3, true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

  for (const [email, name] of [
    [adaEmail, "Leaf"],
    [cyEmail, "Root"],
  ] as const) {
    runLocalSql(
      asUserSql(
        email,
        `select * from public.create_student_group('${classId}'::uuid, '${name}', null);`,
      ),
    );
  }

  runLocalSql(`
      insert into public.activities (id, class_id, title, status, created_by)
      select '${activityId}'::uuid, '${classId}'::uuid, 'Garden survey', 'published', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.activity_versions (id, activity_id, class_id, version_number, title, instructions, created_by)
      select '${versionId}'::uuid, '${activityId}'::uuid, '${classId}'::uuid, 1, 'Garden survey',
        'Stay inside the boundary.', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.activity_boundaries (activity_version_id, boundary)
      values ('${versionId}'::uuid, extensions.st_geomfromtext(
        'POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
      update public.activity_versions as version
      set status = 'published', published_at = now(), published_by = profile.id
      from public.profiles as profile
      where version.id = '${versionId}'::uuid and profile.email = ${sqlLiteral(teacherEmail)};
    `);

  const teacher = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const teacherSignIn = await teacher.auth.signInWithPassword({
    email: teacherEmail,
    password,
  });
  expect(teacherSignIn.error?.message).toBeUndefined();
  const created = await teacher.rpc("create_exploration_session", {
    target_activity_id: activityId,
    session_title: "Morning round",
  });
  expect(created.error?.message).toBeUndefined();
  const sessionId = (created.data as Array<{ session_id: string }>)[0]!
    .session_id;
  const groups = await teacher
    .from("groups")
    .select("id, name")
    .eq("class_id", classId);
  const groupId = (name: string) =>
    groups.data!.find((group) => group.name === name)!.id as string;
  const opened = await teacher.rpc("open_exploration_session", {
    target_session_id: sessionId,
    group_order: [groupId("Leaf"), groupId("Root")],
  });
  expect(opened.error?.message).toBeUndefined();
  const activated = await teacher.rpc("activate_session_group", {
    target_session_id: sessionId,
    target_group_id: groupId("Leaf"),
  });
  expect(activated.error?.message).toBeUndefined();

  return {
    teacherEmail,
    adaEmail,
    cyEmail,
    password,
    classId,
    activityId,
    sessionId,
  };
}

async function openFieldShell(
  browser: Browser,
  baseURL: string,
  email: string,
  password: string,
  shellUrl: string,
) {
  const context = await studentContext(browser, baseURL);
  await signInContext(context, email, password);
  const page = await context.newPage();
  await page.goto(shellUrl);
  await expect(
    page.getByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
  ).toBeVisible({ timeout: 120_000 });
  await page
    .getByRole("region", { name: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง" })
    .getByRole("button", { name: "เริ่มแชร์ตำแหน่ง" })
    .click();
  return { context, page };
}

async function addWholePlantImage(page: Page) {
  const media = page.getByRole("region", { name: /^ภาพหลักฐาน · / });
  await expect(media.getByRole("button", { name: "เลือกจากคลัง" })).toBeEnabled(
    { timeout: 120_000 },
  );
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
}

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

      // Nothing was merged, deleted, or rejected.
      expect(
        queryLocalSql(
          `select count(*) || '|' || string_agg(distinct status, ',')
           from public.observations
           where id in ('${firstId}'::uuid, '${secondId}'::uuid);`,
        ),
      ).toBe("2|submitted");
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
