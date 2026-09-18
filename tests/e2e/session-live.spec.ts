import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P7-04 against the local stack: the teacher opens a session and starts a
// group from the live screen, the active student acknowledges the field-mode
// notice and shares location, a waiting student sees only the queue, and a
// pause stops publishing. Mapbox is not configured, so no tile request may go
// to api.mapbox.com.

const STUDENT_VIEWPORT = { width: 390, height: 844 };

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

declare global {
  interface Window {
    __geolocationCalls?: string[];
  }
}

/** Records every geolocation call the page makes, before any app code runs. */
async function instrumentGeolocation(context: BrowserContext) {
  await context.addInitScript(() => {
    const calls: string[] = [];
    window.__geolocationCalls = calls;
    const geolocation = navigator.geolocation;
    if (!geolocation) return;
    for (const name of [
      "watchPosition",
      "getCurrentPosition",
      "clearWatch",
    ] as const) {
      const original = geolocation[name].bind(geolocation) as (
        ...args: unknown[]
      ) => unknown;
      Object.defineProperty(geolocation, name, {
        configurable: true,
        value: (...args: unknown[]) => {
          calls.push(name);
          return original(...args);
        },
      });
    }
  });
}

function trackMapbox(context: BrowserContext, requests: string[]) {
  context.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("mapbox.com")) {
      requests.push(request.url());
    }
  });
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
  mapboxRequests: string[],
  options: { geolocation: boolean },
) {
  const context = await browser.newContext({
    baseURL,
    viewport: STUDENT_VIEWPORT,
    ...(options.geolocation
      ? {
          permissions: ["geolocation"],
          geolocation: { latitude: 13.7551, longitude: 100.5051, accuracy: 8 },
        }
      : {}),
  });
  trackMapbox(context, mapboxRequests);
  await instrumentGeolocation(context);
  return context;
}

async function geolocationCalls(page: Page) {
  return page.evaluate(() => window.__geolocationCalls ?? []);
}

test.describe("P7-04 student session shell and teacher live controls", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("teacher starts a group, its student shares location, a waiting student sees only the queue, and pause stops sending", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "P7-04 multi-role journey runs once against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const env = getLocalSupabaseEnv();
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `p7-shell-teacher-${suffix}@example.edu`;
    const adaEmail = `p7-shell-ada-${suffix}@example.edu`;
    const boEmail = `p7-shell-bo-${suffix}@example.edu`;
    const cyEmail = `p7-shell-cy-${suffix}@example.edu`;
    const diEmail = `p7-shell-di-${suffix}@example.edu`;
    const emails = [teacherEmail, adaEmail, boEmail, cyEmail, diEmail];
    const emailList = emails.map(sqlLiteral).join(", ");
    const password = "session shell passphrase 1";
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
      update public.profiles set display_name = 'Bo Member' where email = ${sqlLiteral(boEmail)};
      update public.profiles set display_name = 'Cy Leader' where email = ${sqlLiteral(cyEmail)};
      update public.profiles set display_name = 'Di Leader' where email = ${sqlLiteral(diEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Shell School', id from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Shell Class', 1, 4, 3, true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    // Separate runs give distinct created_at values, which fix the queue
    // order (Leaf, Root, Stem) in the setup read model.
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
      insert into public.group_members (class_id, group_id, user_id, role, invited_by)
      select '${classId}'::uuid, grouped.id, bo.id, 'member', ada.id
      from public.groups as grouped
      cross join public.profiles as bo
      cross join public.profiles as ada
      where grouped.class_id = '${classId}'::uuid and grouped.name = 'Leaf'
        and bo.email = ${sqlLiteral(boEmail)} and ada.email = ${sqlLiteral(adaEmail)};

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
      insert into public.activity_routes (activity_version_id, route)
      values ('${versionId}'::uuid, extensions.st_geomfromtext(
        'LINESTRING(100.501 13.751, 100.509 13.759)', 4326));
      insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
      values ('${versionId}'::uuid, 1, 'Start', extensions.st_geomfromtext('POINT(100.508 13.758)', 4326));
      update public.activity_versions as version
      set status = 'published', published_at = now(), published_by = profile.id
      from public.profiles as profile
      where version.id = '${versionId}'::uuid and profile.email = ${sqlLiteral(teacherEmail)};
    `);

    runLocalSql(
      asUserSql(
        teacherEmail,
        `select * from public.create_exploration_session('${activityId}'::uuid, 'Morning round');`,
      ),
    );
    const sessionId = queryLocalSql(
      `select id from public.exploration_sessions where class_id = '${classId}'::uuid;`,
    ).trim();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    const mapboxRequests: string[] = [];
    trackMapbox(page.context(), mapboxRequests);
    const contexts: BrowserContext[] = [];

    try {
      // Teacher: open the session from the setup screen, then go live.
      await signInContext(
        page.context(),
        teacherEmail,
        password,
        "/teacher/classes",
      );
      await page.goto(`/teacher/classes/${classId}/sessions/${sessionId}`);
      await expect(
        page.getByRole("heading", { name: "ตั้งค่ารอบสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      const openButton = page
        .getByRole("button", { name: "เปิดรอบสำรวจ", exact: true })
        .first();
      await expect(openButton).toBeEnabled({ timeout: 30_000 });
      await openButton.click();
      await page
        .getByRole("alertdialog", { name: "เปิดรอบสำรวจ Morning round?" })
        .getByRole("button", { name: "เปิดรอบสำรวจ", exact: true })
        .click();
      await expect(
        page.getByText("เปิดรอบสำรวจแล้ว · บันทึก 3 กลุ่ม นักเรียน 4 คน"),
      ).toBeVisible({ timeout: 120_000 });

      // Warm the routes this journey needs so no step waits on a cold compile.
      await Promise.all([
        page.request.get(`/api/sessions/${sessionId}/group-queue`),
        page.request.get(`/api/sessions/${sessionId}/live-locations`),
        page.request.get(`/api/sessions/${sessionId}/participant`),
      ]);

      await page.getByRole("link", { name: "ไปหน้าควบคุมรอบสด" }).click();
      await page.waitForURL(/\/sessions\/[0-9a-f-]{36}\/live$/, {
        timeout: 120_000,
      });
      await expect(
        page.getByRole("heading", { name: "รอบสำรวจสด" }),
      ).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText("อัปเดตสดอยู่")).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "เปิดกลุ่มถัดไป" }).click();
      await expect(page.getByText("Leaf เริ่มสำรวจแล้ว")).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByRole("listitem", { name: "คิวที่ 1 Leaf" }),
      ).toContainText("กำลังสำรวจ");
      await expect(
        page.getByRole("listitem", { name: "คิวที่ 2 Root" }),
      ).toContainText("กลุ่มถัดไป");
      await expect(
        page.getByRole("listitem", { name: "คิวที่ 3 Stem" }),
      ).toContainText("กำลังรอ");

      // Active student: the notice gates publishing, then location is shared.
      const adaContext = await studentContext(
        browser,
        baseURL,
        mapboxRequests,
        { geolocation: true },
      );
      contexts.push(adaContext);
      const adaSamples: string[] = [];
      adaContext.on("request", (sent) => {
        if (sent.url().includes("/location-samples"))
          adaSamples.push(sent.url());
      });
      await signInContext(adaContext, adaEmail, password, "/app");
      const ada = await adaContext.newPage();
      let adaBroadcasts = 0;
      ada.on("websocket", (socket) => {
        socket.on("framesent", (frame) => {
          if (
            typeof frame.payload === "string" &&
            frame.payload.includes("location.sample")
          ) {
            adaBroadcasts += 1;
          }
        });
      });
      await ada.goto(`/activities/${activityId}/sessions/${sessionId}`);
      await expect(
        ada.getByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      const notice = ada.getByRole("region", {
        name: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง",
      });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(
        "เฉพาะครูของชั้นเรียนนี้ที่เห็นชื่อและตำแหน่งสดของคุณ",
      );
      expect(await geolocationCalls(ada)).toEqual([]);
      await expectNoHorizontalOverflow(ada);

      await notice.getByRole("button", { name: "เริ่มแชร์ตำแหน่ง" }).click();
      const strip = ada.getByRole("region", { name: "สถานะโหมดสนาม" });
      await expect(strip).toContainText("ส่งตำแหน่งอยู่", { timeout: 30_000 });
      await expect(strip).toContainText("±8 ม.");
      await expect(ada.locator("body")).not.toContainText("13.755");

      // Teacher sees the named position with its accuracy. Nudging the fix
      // makes the student broadcast again in case the teacher joined late.
      const adaRow = page
        .getByRole("list", { name: "รายชื่อตำแหน่งนักเรียน" })
        .getByRole("listitem")
        .filter({ hasText: "Ada Leader" });
      let nudge = 0;
      await expect(async () => {
        nudge += 1;
        await adaContext.setGeolocation({
          latitude: 13.7551 + nudge * 0.0003,
          longitude: 100.5051,
          accuracy: 8,
        });
        await expect(adaRow).toContainText("±8 ม.", { timeout: 3_000 });
      }).toPass({ timeout: 15_000, intervals: [1_000, 2_000, 3_000] });
      await expect(adaRow).toContainText(/อัปเดต \d+ วินาทีที่แล้ว/);
      await expect(
        page.getByRole("img", { name: /นักเรียน \d คน/ }),
      ).toBeVisible();

      // Waiting student: queue state only, no geolocation, no peer positions.
      const diContext = await studentContext(browser, baseURL, mapboxRequests, {
        geolocation: false,
      });
      contexts.push(diContext);
      await signInContext(diContext, diEmail, password, "/app");
      const di = await diContext.newPage();
      await di.goto(`/activities/${activityId}/sessions/${sessionId}`);
      await expect(
        di.getByRole("heading", { name: "กลุ่มของคุณอยู่คิวที่ 3" }),
      ).toBeVisible({ timeout: 120_000 });
      await expect(di.getByText("รออีก 2 กลุ่มก่อนถึงคิวของคุณ")).toBeVisible();
      // The participant read model the shell refetches carries no positions.
      const participantResponse = await diContext.request.get(
        `/api/sessions/${sessionId}/participant`,
      );
      expect(participantResponse.status()).toBe(200);
      // Activity geometry is shared preview data; Ada's live position is not.
      expect(await participantResponse.text()).not.toMatch(
        /latestSample|accuracyM|13\.755[1-9]|100\.505[1-9]/,
      );
      await expect(di.locator("body")).not.toContainText("Ada Leader");
      await expect(di.locator("body")).not.toContainText("13.755");
      await expect(
        di.getByRole("region", { name: "สถานะโหมดสนาม" }),
      ).toHaveCount(0);
      expect(await geolocationCalls(di)).toEqual([]);
      await expectNoHorizontalOverflow(di);

      // Pause: the student's shell leaves field mode and stops sending.
      await page.getByRole("button", { name: "พักรอบ" }).click();
      await expect(
        page.getByText("พักรอบแล้ว · นักเรียนหยุดส่งตำแหน่ง"),
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByText(
          "พักรอบอยู่ · นักเรียนหยุดส่งตำแหน่ง และไม่แสดงตำแหน่งล่าสุด",
        ),
      ).toBeVisible({ timeout: 30_000 });

      await expect(
        ada.getByRole("heading", { name: "ครูพักรอบสำรวจชั่วคราว" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        ada.getByRole("region", { name: "สถานะโหมดสนาม" }),
      ).toHaveCount(0);
      // Every watch the shell started has been cleared.
      await expect
        .poll(async () => {
          const calls = await geolocationCalls(ada);
          const watches = calls.filter((call) => call === "watchPosition");
          const clears = calls.filter((call) => call === "clearWatch");
          return watches.length > 0 && watches.length === clears.length;
        })
        .toBe(true);
      const samplesAtPause = adaSamples.length;
      const broadcastsAtPause = adaBroadcasts;
      await adaContext.setGeolocation({
        latitude: 13.7575,
        longitude: 100.5075,
        accuracy: 8,
      });
      // Longer than the 15 s durable-sample interval.
      await ada.waitForTimeout(16_000);
      expect(adaSamples.length).toBe(samplesAtPause);
      expect(adaBroadcasts).toBe(broadcastsAtPause);

      // The waiting student saw the pause too, still without geolocation.
      await expect(di.getByText("ตอนนี้ครูพักรอบสำรวจชั่วคราว")).toBeVisible({
        timeout: 30_000,
      });
      expect(await geolocationCalls(di)).toEqual([]);

      expect(mapboxRequests).toEqual([]);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});
