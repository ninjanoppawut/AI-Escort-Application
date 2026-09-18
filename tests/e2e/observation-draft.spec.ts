import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P8-04 against the local stack at 390 px: an active student starts an
// observation from the session shell and lands on a private draft; the draft
// survives a reload; a weak fix warns but still creates a draft; two pages of
// the same student meet the version-conflict dialog; the class teacher gets
// the permission-denied state; a waiting-group student sees the start
// disabled with its reason.

const STUDENT_VIEWPORT = { width: 390, height: 844 };
const DRAFT_URL = /\/observations\/[0-9a-f-]{36}$/;
const PRIVACY_LABEL = "ร่างส่วนตัว — ครูยังไม่เห็นจนกว่าคุณจะส่ง";

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
  returnTo: string,
) {
  const response = await context.request.post("/api/auth/sign-in", {
    data: { email, password, returnTo },
  });
  expect(response.status(), `sign-in failed: ${await response.text()}`).toBe(
    200,
  );
}

async function studentContext(
  browser: Browser,
  baseURL: string,
  geolocation: { latitude: number; longitude: number; accuracy: number } | null,
) {
  return browser.newContext({
    baseURL,
    viewport: STUDENT_VIEWPORT,
    ...(geolocation ? { permissions: ["geolocation"], geolocation } : {}),
  });
}

/** Starts an observation from the shell and returns the new draft's ID. */
async function startObservation(
  page: Page,
  expectedChip: string | RegExp,
  afterOpen?: () => Promise<void>,
) {
  const start = page.getByRole("button", { name: "เพิ่มการสังเกต" });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มการสังเกต" });
  await expect(sheet).toBeVisible();
  // Emulated geolocation only emits when the override changes, while the
  // capture sheet asks for a fresh fix (maximumAge 0); a real GPS keeps
  // emitting, so tests nudge the position once the sheet is watching.
  await afterOpen?.();
  await expect(sheet).toContainText(expectedChip, { timeout: 30_000 });
  await expect(sheet).toContainText(
    "หมุดของต้นไม้จะใช้ตำแหน่งนี้ ณ ตอนเริ่มบันทึก ไม่ใช่ตอนกดส่ง",
  );
  const use = sheet.getByRole("button", { name: "ใช้ตำแหน่งนี้" });
  await expect(use).toBeEnabled();
  await use.click();
  await page.waitForURL(DRAFT_URL, { timeout: 120_000 });
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test.describe("P8-04 private observation drafts", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("start, reload, weak fix, conflict, teacher denial, and waiting-group block", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P8-04 draft journey runs once, at 390 px, against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const env = getLocalSupabaseEnv();
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `p8-draft-teacher-${suffix}@example.edu`;
    const adaEmail = `p8-draft-ada-${suffix}@example.edu`;
    const cyEmail = `p8-draft-cy-${suffix}@example.edu`;
    const diEmail = `p8-draft-di-${suffix}@example.edu`;
    const emails = [teacherEmail, adaEmail, cyEmail, diEmail];
    const emailList = emails.map(sqlLiteral).join(", ");
    const password = "observation draft passphrase 1";
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
      update public.profiles set display_name = 'Di Leader' where email = ${sqlLiteral(diEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Draft School', id from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Draft Class', 1, 4, 3, true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    for (const [email, name] of [
      [adaEmail, "Leaf"],
      [cyEmail, "Root"],
      [diEmail, "Stem"],
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

    // The teacher creates, opens, and activates Leaf over RPC; the teacher
    // screens are covered by session-live.spec.ts.
    const teacher = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await teacher.auth.signInWithPassword({
      email: teacherEmail,
      password,
    });
    expect(signedIn.error?.message).toBeUndefined();
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
      group_order: [groupId("Leaf"), groupId("Root"), groupId("Stem")],
    });
    expect(opened.error?.message).toBeUndefined();
    const activated = await teacher.rpc("activate_session_group", {
      target_session_id: sessionId,
      target_group_id: groupId("Leaf"),
    });
    expect(activated.error?.message).toBeUndefined();

    const shellUrl = `/activities/${activityId}/sessions/${sessionId}`;
    const contexts: BrowserContext[] = [];

    try {
      // Active student at 390 px with a good fix.
      const adaContext = await studentContext(browser, baseURL, {
        latitude: 13.7551,
        longitude: 100.5051,
        accuracy: 8,
      });
      contexts.push(adaContext);
      await signInContext(adaContext, adaEmail, password, "/app");
      // Warm the routes this journey needs so no step waits on a cold compile.
      await Promise.all([
        adaContext.request.get(`/api/sessions/${sessionId}/participant`),
        adaContext.request.get(`/api/sessions/${sessionId}/observations`),
      ]);

      const ada = await adaContext.newPage();
      await ada.goto(shellUrl);
      await expect(
        ada.getByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      // Clear the sticky live-location notice so it covers nothing.
      await ada
        .getByRole("region", { name: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง" })
        .getByRole("button", { name: "เริ่มแชร์ตำแหน่ง" })
        .click();
      await expect(
        ada.getByRole("heading", { name: "การสังเกตของฉัน (0)" }),
      ).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalOverflow(ada);

      const firstId = await startObservation(ada, "±8 ม.", () =>
        adaContext.setGeolocation({
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 7.6,
        }),
      );
      await expect(ada.getByText("ฉบับร่าง", { exact: true })).toBeVisible({
        timeout: 120_000,
      });
      await expect(ada.getByText(PRIVACY_LABEL)).toBeVisible();
      const capture = ada.getByRole("region", { name: "ตำแหน่งที่ปักหมุด" });
      await expect(capture).toContainText("±8 ม.");
      await expect(capture).toContainText("13.75510, 100.50510");
      await expectNoHorizontalOverflow(ada);
      expect(
        queryLocalSql(
          `select location_status || '|' || capture_accuracy_m || '|' || status
           from public.observations where id = '${firstId}'::uuid;`,
        ),
      ).toBe("captured|7.6|draft");

      // A reload keeps the same private draft.
      await ada.reload();
      await expect(ada.getByText("ฉบับร่าง", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        ada.getByRole("region", { name: "ตำแหน่งที่ปักหมุด" }),
      ).toContainText("±8 ม.");

      // A weak fix warns in amber text but still creates a draft (D-051).
      await adaContext.setGeolocation({
        latitude: 13.7553,
        longitude: 100.5053,
        accuracy: 150,
      });
      await ada.goto(shellUrl);
      await expect(
        ada.getByRole("heading", { name: "การสังเกตของฉัน (1)" }),
      ).toBeVisible({ timeout: 60_000 });
      const weakId = await startObservation(
        ada,
        "สัญญาณตำแหน่งอ่อน (±150 ม.) — รอสักครู่ให้แม่นขึ้น",
        () =>
          adaContext.setGeolocation({
            latitude: 13.7554,
            longitude: 100.5054,
            accuracy: 150,
          }),
      );
      expect(weakId).not.toBe(firstId);
      await expect(ada.getByText("สัญญาณตำแหน่งอ่อน (±150 ม.)")).toBeVisible({
        timeout: 60_000,
      });
      expect(
        queryLocalSql(
          `select count(*) from public.observations
           where observer_id = (select id from public.profiles where email = ${sqlLiteral(adaEmail)});`,
        ),
      ).toBe("2");

      // The same student edits the first draft from two pages.
      const pageA = await adaContext.newPage();
      const pageB = await adaContext.newPage();
      await pageA.goto(`/observations/${firstId}`);
      await pageB.goto(`/observations/${firstId}`);
      await expect(pageA.getByLabel("หลักฐานสั้น ๆ")).toBeVisible({
        timeout: 60_000,
      });
      await expect(pageB.getByLabel("ชื่อไทยหรือชื่อทั่วไป")).toBeVisible({
        timeout: 60_000,
      });

      await pageB.getByLabel("ชื่อไทยหรือชื่อทั่วไป").fill("มะม่วง");
      await pageA.getByLabel("หลักฐานสั้น ๆ").fill("ใบเดี่ยว เรียงสลับ");
      await pageA.getByRole("button", { name: "บันทึกร่าง" }).click();
      await expect(pageA.locator("[data-save-state]")).toHaveAttribute(
        "data-save-state",
        "updated",
        { timeout: 30_000 },
      );

      await pageB.getByRole("button", { name: "บันทึกร่าง" }).click();
      const conflict = pageB.getByRole("alertdialog", {
        name: "ข้อมูลมีการเปลี่ยนแปลงแล้ว",
      });
      await expect(conflict).toBeVisible({ timeout: 30_000 });
      await expect(conflict).toContainText("ใบเดี่ยว เรียงสลับ");
      await expect(conflict).toContainText("มะม่วง");
      // Nothing was overwritten while the dialog is open.
      await expect(pageB.getByLabel("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue(
        "มะม่วง",
      );
      await conflict
        .getByRole("button", { name: "ดูข้อมูลล่าสุดและทำซ้ำ" })
        .click();
      await expect(conflict).toBeHidden();
      await expect(pageB.getByLabel("หลักฐานสั้น ๆ")).toHaveValue(
        "ใบเดี่ยว เรียงสลับ",
      );
      await expect(pageB.getByLabel("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue(
        "มะม่วง",
      );
      await pageB.getByRole("button", { name: "บันทึกร่าง" }).click();
      await expect(pageB.locator("[data-save-state]")).toHaveAttribute(
        "data-save-state",
        "updated",
        { timeout: 30_000 },
      );
      expect(
        queryLocalSql(
          `select version || '|' || student_common_name || '|' || student_evidence_note
           from public.observations where id = '${firstId}'::uuid;`,
        ),
      ).toBe("3|มะม่วง|ใบเดี่ยว เรียงสลับ");
      await expectNoHorizontalOverflow(pageB);

      // The class teacher gets the permission-denied state, not the draft.
      await signInContext(
        page.context(),
        teacherEmail,
        password,
        "/teacher/classes",
      );
      await page.goto(`/observations/${firstId}`);
      const denied = page.getByRole("main").getByRole("alert");
      await expect(denied).toContainText("คุณไม่มีสิทธิ์ทำรายการนี้", {
        timeout: 120_000,
      });
      await expect(denied).toContainText(
        "ร่างการสังเกตเป็นข้อมูลส่วนตัวของนักเรียน",
      );
      await expect(page).toHaveURL(new RegExp(`/observations/${firstId}$`));
      await expect(page.locator("body")).not.toContainText("13.755");
      await expect(page.locator("body")).not.toContainText("ใบเดี่ยว");
      const teacherRead = await page.request.get(
        `/api/observations/${firstId}`,
      );
      expect(teacherRead.status()).toBe(403);

      // A waiting-group student sees the start disabled with its reason.
      const diContext = await studentContext(browser, baseURL, null);
      contexts.push(diContext);
      await signInContext(diContext, diEmail, password, "/app");
      const di = await diContext.newPage();
      await di.goto(shellUrl);
      await expect(
        di.getByRole("heading", { name: "กลุ่มของคุณอยู่คิวที่ 3" }),
      ).toBeVisible({ timeout: 120_000 });
      const diStart = di.getByRole("button", { name: "เพิ่มการสังเกต" });
      await expect(diStart).toBeDisabled({ timeout: 30_000 });
      await expect(di.getByText("กลุ่มของคุณยังไม่ถึงรอบสำรวจ")).toBeVisible();
      await expect(
        di.getByText("เริ่มบันทึกได้เมื่อครูเริ่มรอบสำรวจของกลุ่มคุณ", {
          exact: false,
        }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(di);

      // A classmate opening Ada's draft link gets the same denial.
      await di.goto(`/observations/${firstId}`);
      await expect(di.getByRole("main").getByRole("alert")).toContainText(
        "คุณไม่มีสิทธิ์ทำรายการนี้",
        { timeout: 60_000 },
      );
      await expect(di.locator("body")).not.toContainText("ใบเดี่ยว");
    } finally {
      for (const context of contexts) await context.close();
      await teacher.auth.signOut();
    }
  });
});
