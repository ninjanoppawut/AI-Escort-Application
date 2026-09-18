import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import {
  DEFAULT_FIXTURE_EXPECTED_SIZE,
  containsFakeCameraMake,
  createExifJpegFixture,
  hasExifMetadata,
} from "./support/image-fixtures";
import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P9-03/P9-04 against the local stack at 390 px: the owner adds the EXIF
// orientation-6 fixture from the gallery on a private draft; it is stored
// upright (1536 × 2048) without EXIF, as a whole-plant image, with a Storage
// object. A second image whose first Storage upload is aborted shows the
// failed tile; a tap retries it and it is confirmed with attempt_count 2.
// A classmate is refused both the media API and the object itself. The
// section fits a 360 px screen.

const STUDENT_VIEWPORT = { width: 390, height: 844 };
const SMALL_VIEWPORT = { width: 360, height: 800 };
const DRAFT_URL = /\/observations\/[0-9a-f-]{36}$/;
const STORAGE_OBJECT_UPLOAD = /\/storage\/v1\/object\/observation-images\//;

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
/**
 * Opens a tile's detail panel. Tapping toggles selection (and a tapped failed
 * tile is retried and selected), so this taps only while the tile is not
 * pressed and retries until the category picker is showing.
 */
async function openTilePanel(media: Locator, tile: Locator) {
  const button = tile.getByRole("button").first();
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== "true") {
      await button.click();
    }
    await expect(
      media.getByRole("radiogroup", { name: "ประเภทของภาพนี้" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

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
  // capture sheet asks for a fresh fix (maximumAge 0); nudge it once the
  // sheet is watching.
  await afterOpen?.();
  await expect(sheet).toContainText(expectedChip, { timeout: 30_000 });
  const use = sheet.getByRole("button", { name: "ใช้ตำแหน่งนี้" });
  await expect(use).toBeEnabled();
  await use.click();
  await page.waitForURL(DRAFT_URL, { timeout: 120_000 });
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test.describe("P9 observation images", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("gallery upload, EXIF-free upright storage, tap-to-retry, private access, and 360 px layout", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P9 image journey runs once, at 390 px, against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const env = getLocalSupabaseEnv();
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `p9-media-teacher-${suffix}@example.edu`;
    const adaEmail = `p9-media-ada-${suffix}@example.edu`;
    const cyEmail = `p9-media-cy-${suffix}@example.edu`;
    const emails = [teacherEmail, adaEmail, cyEmail];
    const emailList = emails.map(sqlLiteral).join(", ");
    const password = "observation media passphrase 1";
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
      select '${schoolId}'::uuid, 'Media School', id from public.profiles where email = ${sqlLiteral(teacherEmail)};
      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Media Class', 1, 4, 3, true, 'open', id
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

    // The teacher creates, opens, and activates Leaf over RPC.
    const teacher = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const classmate = createClient(env.API_URL!, env.PUBLISHABLE_KEY!, {
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

    const shellUrl = `/activities/${activityId}/sessions/${sessionId}`;
    const contexts: BrowserContext[] = [];

    try {
      const adaContext = await studentContext(browser, baseURL, {
        latitude: 13.7551,
        longitude: 100.5051,
        accuracy: 8,
      });
      contexts.push(adaContext);
      // A fake clock that runs normally until paused, so the retry path can
      // hold the automatic backoff and prove the manual tap.
      await adaContext.clock.install();
      await signInContext(adaContext, adaEmail, password, "/app");
      await Promise.all([
        adaContext.request.get(`/api/sessions/${sessionId}/participant`),
        adaContext.request.get(`/api/sessions/${sessionId}/observations`),
      ]);

      const ada = await adaContext.newPage();
      await ada.goto(shellUrl);
      await expect(
        ada.getByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
      ).toBeVisible({ timeout: 120_000 });
      await ada
        .getByRole("region", { name: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง" })
        .getByRole("button", { name: "เริ่มแชร์ตำแหน่ง" })
        .click();

      const observationId = await startObservation(ada, "±8 ม.", () =>
        adaContext.setGeolocation({
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 7.6,
        }),
      );
      const mediaApi = `/api/observations/${observationId}/media`;
      await adaContext.request.get(mediaApi);

      const media = ada.getByRole("region", { name: /^ภาพหลักฐาน · / });
      await expect(media).toContainText("ภาพหลักฐาน · 0 จาก 10", {
        timeout: 120_000,
      });
      await expect(media).toContainText("ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ");
      const gallery = media.getByRole("button", { name: "เลือกจากคลัง" });
      await expect(gallery).toBeEnabled({ timeout: 60_000 });
      await expect(
        media.getByRole("button", { name: "ถ่ายภาพ" }),
      ).toBeEnabled();
      await expectNoHorizontalOverflow(ada);

      // 1. The EXIF orientation-6 fixture from the gallery: the first image
      //    of an empty draft is the whole plant.
      const galleryInput = media.locator(
        'input[type="file"][data-media-input="gallery"]',
      );
      await galleryInput.setInputFiles({
        name: "plant-exif6.jpg",
        mimeType: "image/jpeg",
        buffer: createExifJpegFixture(),
      });
      const firstTile = media.locator("[data-media-tile]").nth(0);
      await expect(firstTile).toHaveAttribute("data-tile-state", "uploaded", {
        timeout: 120_000,
      });
      await expect(firstTile).toContainText("อัปโหลดแล้ว");
      await expect(firstTile).toContainText("ทั้งต้น");
      await expect(media).toContainText("มีภาพทั้งต้นแล้ว");
      await expect(media).toContainText("ภาพหลักฐาน · 1 จาก 10");

      // Its category is ทั้งต้น in the picker, and deleting the only
      // whole-plant image is blocked with the reason.
      await openTilePanel(media, firstTile);
      const firstPanel = media.getByRole("radiogroup", {
        name: "ประเภทของภาพนี้",
      });
      await expect(
        firstPanel.getByRole("radio", { name: "ทั้งต้น", exact: true }),
      ).toBeChecked();
      await expect(media.getByRole("button", { name: "ลบภาพ" })).toBeDisabled();
      await expect(media).toContainText(
        "ลบภาพทั้งต้นภาพสุดท้ายไม่ได้ — เพิ่มภาพทั้งต้นใหม่ก่อน",
      );
      await media.getByRole("button", { name: /^ปิด/ }).click();

      const adaId = queryLocalSql(
        `select id from public.profiles where email = ${sqlLiteral(adaEmail)};`,
      );
      expect(
        queryLocalSql(
          `select width_px || 'x' || height_px || '|' || status || '|' || category
           from public.observation_media
           where observation_id = '${observationId}'::uuid;`,
        ),
      ).toBe(
        `${DEFAULT_FIXTURE_EXPECTED_SIZE.width}x${DEFAULT_FIXTURE_EXPECTED_SIZE.height}|uploaded|whole_plant`,
      );
      const storagePath = queryLocalSql(
        `select storage_path from public.observation_media
         where observation_id = '${observationId}'::uuid and category = 'whole_plant';`,
      );
      expect(storagePath).toMatch(
        new RegExp(`^${classId}/${sessionId}/${observationId}/`),
      );
      expect(
        queryLocalSql(
          `select count(*) || '|' || min(owner_id) from storage.objects
           where bucket_id = 'observation-images' and name = ${sqlLiteral(storagePath)};`,
        ),
      ).toBe(`1|${adaId}`);
      await expect(ada.locator("body")).not.toContainText(storagePath);

      // The stored object has no EXIF (no orientation, camera, or GPS).
      const list = await adaContext.request.get(mediaApi);
      expect(list.status()).toBe(200);
      const listBody = (await list.json()) as {
        data: {
          items: Array<{
            id: string;
            signedUrl: string | null;
            status: string;
          }>;
        };
      };
      const signedUrl = listBody.data.items[0]!.signedUrl;
      expect(signedUrl).toBeTruthy();
      expect(listBody.data.items[0]).not.toHaveProperty("upload");
      const download = await adaContext.request.get(signedUrl!);
      expect(download.status()).toBe(200);
      const bytes = await download.body();
      expect(bytes.byteLength).toBeGreaterThan(0);
      expect(hasExifMetadata(bytes)).toBe(false);
      expect(containsFakeCameraMake(bytes)).toBe(false);

      // 2. Retry path: the first Storage upload of the next image is
      //    aborted. The clock is paused so the automatic backoff waits and
      //    the failed tile stays until the student taps it.
      let storageUploads = 0;
      await ada.route(STORAGE_OBJECT_UPLOAD, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        storageUploads += 1;
        if (storageUploads === 1) return route.abort("connectionreset");
        return route.continue();
      });
      const pausedAt = await ada.evaluate(() => Date.now());
      await ada.clock.pauseAt(pausedAt + 1_000);

      await galleryInput.setInputFiles({
        name: "leaf.jpg",
        mimeType: "image/jpeg",
        buffer: createExifJpegFixture({ width: 1600, height: 1200 }),
      });
      // One whole-plant image exists, so this one waits for a category.
      const picker = media.getByRole("radiogroup", {
        name: "ประเภทของภาพนี้",
      });
      await expect(picker).toBeVisible({ timeout: 60_000 });
      await picker.getByText("ใบ", { exact: true }).click();
      await expect(
        picker.getByRole("radio", { name: "ใบ", exact: true }),
      ).toBeChecked();
      await media.getByRole("button", { name: "ส่งภาพนี้" }).click();

      const secondTile = media.locator("[data-media-tile]").nth(1);
      await expect(secondTile).toHaveAttribute("data-tile-state", "failed", {
        timeout: 60_000,
      });
      await expect(secondTile).toContainText(
        "ส่งภาพนี้ไม่สำเร็จ — แตะเพื่อลองใหม่",
      );
      await expect(
        media.getByRole("button", { name: "ลองใหม่ทั้งหมด" }),
      ).toBeVisible();
      expect(storageUploads).toBe(1);

      await secondTile
        .getByRole("button", { name: /ส่งภาพนี้ไม่สำเร็จ — แตะเพื่อลองใหม่/ })
        .click();
      await expect(secondTile).toHaveAttribute("data-tile-state", "uploaded", {
        timeout: 60_000,
      });
      await ada.clock.resume();
      expect(storageUploads).toBe(2);
      await expect(media).toContainText("ภาพหลักฐาน · 2 จาก 10");
      expect(
        queryLocalSql(
          `select category || '|' || status || '|' || upload_attempt_count
           from public.observation_media
           where observation_id = '${observationId}'::uuid and category = 'leaf';`,
        ),
      ).toBe("leaf|uploaded|2");
      expect(
        queryLocalSql(
          `select string_agg(payload ->> 'attempt_count', ',' order by occurred_at)
           from public.research_events
           where event_name = 'image_uploaded'
             and observation_id = '${observationId}'::uuid;`,
        ),
      ).toBe("1,2");

      // 3. 360 px: the grid, panel chips, and capture controls fit.
      await ada.setViewportSize(SMALL_VIEWPORT);
      await expectNoHorizontalOverflow(ada);
      await openTilePanel(media, secondTile);
      await expect(
        media.getByRole("radiogroup", { name: "ประเภทของภาพนี้" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(ada);

      // 4. A classmate is refused the media list and the object itself.
      const cyContext = await studentContext(browser, baseURL, null);
      contexts.push(cyContext);
      await signInContext(cyContext, cyEmail, password, "/app");
      const classmateList = await cyContext.request.get(mediaApi);
      expect(classmateList.status()).toBe(403);
      expect(await classmateList.text()).not.toContain(storagePath);

      const classmateSignIn = await classmate.auth.signInWithPassword({
        email: cyEmail,
        password,
      });
      expect(classmateSignIn.error?.message).toBeUndefined();
      const classmateToken = classmateSignIn.data.session!.access_token;
      const directObject = await request.get(
        `${env.API_URL}/storage/v1/object/authenticated/observation-images/${storagePath}`,
        {
          headers: {
            apikey: env.PUBLISHABLE_KEY!,
            authorization: `Bearer ${classmateToken}`,
          },
        },
      );
      expect(directObject.ok()).toBe(false);
      const downloaded = await classmate.storage
        .from("observation-images")
        .download(storagePath);
      expect(downloaded.data).toBeNull();
      expect(downloaded.error).not.toBeNull();
      const resigned = await classmate.storage
        .from("observation-images")
        .createSignedUrl(storagePath, 60);
      expect(resigned.data?.signedUrl ?? null).toBeNull();

      // The class teacher cannot read a private draft's images either.
      await signInContext(
        cyContext,
        teacherEmail,
        password,
        "/teacher/classes",
      );
      expect((await cyContext.request.get(mediaApi)).status()).toBe(403);
    } finally {
      for (const context of contexts) await context.close();
      await teacher.auth.signOut();
      await classmate.auth.signOut();
    }
  });
});
