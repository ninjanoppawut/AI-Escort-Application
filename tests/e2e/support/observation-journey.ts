import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { createExifJpegFixture } from "./image-fixtures";
import {
  createConfirmedUser,
  getLocalSupabaseEnv,
  runLocalSql,
  sqlLiteral,
} from "./local-supabase";

// Shared field-journey fixtures for the observation review specs (P11, P12):
// a class with two single-student groups and an open session, the student
// shell, starting an observation, and a whole-plant image.

export const STUDENT_VIEWPORT = { width: 390, height: 844 };
export const SMALL_VIEWPORT = { width: 360, height: 800 };
export const TEACHER_VIEWPORT = { width: 1280, height: 900 };
export const DRAFT_URL = /\/observations\/[0-9a-f-]{36}$/;
export const EVIDENCE =
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

export async function signInContext(
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

export async function studentContext(browser: Browser, baseURL: string) {
  return browser.newContext({
    baseURL,
    viewport: STUDENT_VIEWPORT,
    permissions: ["geolocation"],
    geolocation: { latitude: 13.7551, longitude: 100.5051, accuracy: 8 },
  });
}

export async function startObservation(page: Page, context: BrowserContext) {
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

export interface Field {
  teacherEmail: string;
  adaEmail: string;
  cyEmail: string;
  password: string;
  classId: string;
  activityId: string;
  sessionId: string;
}

/** A class, two single-student groups, and an open session with Leaf active. */
export async function setupField(
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

export async function openFieldShell(
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

export async function addWholePlantImage(page: Page) {
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

/** Reviews and submits a draft over the owner's API session. */
export async function submitViaApi(
  context: BrowserContext,
  observationId: string,
  names: { commonName: string; scientificName: string },
) {
  const draft = (await (
    await context.request.get(`/api/observations/${observationId}`)
  ).json()) as { data: { version: number } };
  const saved = await context.request.put(
    `/api/observations/${observationId}/student-review`,
    {
      data: {
        expectedVersion: draft.data.version,
        identitySource: "manual",
        commonName: names.commonName,
        scientificName: names.scientificName,
        evidenceNote: EVIDENCE,
        referenceNote: null,
        traits: [],
      },
    },
  );
  expect(saved.status(), await saved.text()).toBe(200);
  const savedBody = (await saved.json()) as { data: { version: number } };
  const submitted = await context.request.post(
    `/api/observations/${observationId}/submit`,
    {
      data: {
        clientSubmissionId: randomUUID(),
        expectedVersion: savedBody.data.version,
        acknowledgeSameSpecies: false,
      },
    },
  );
  expect(submitted.status(), await submitted.text()).toBe(201);
}

export async function teacherContext(browser: Browser, baseURL: string) {
  return browser.newContext({ baseURL, viewport: TEACHER_VIEWPORT });
}
