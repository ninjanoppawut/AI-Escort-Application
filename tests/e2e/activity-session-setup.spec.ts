import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

const BOUNDARY = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [100.5, 13.75],
      [100.51, 13.75],
      [100.51, 13.76],
      [100.5, 13.76],
      [100.5, 13.75],
    ],
  ],
});

const ROUTE = JSON.stringify({
  type: "LineString",
  coordinates: [
    [100.501, 13.751],
    [100.509, 13.759],
  ],
});

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

/** Saves the draft and reports the on-screen error when the save is refused. */
async function saveDraft(page: Page, expectedNotice: string) {
  await page.getByRole("button", { name: "บันทึกร่าง" }).click();
  const notice = page.getByText(expectedNotice);
  // Scoped to main: Next's route announcer is also role=alert and announces
  // the page title in production builds.
  const failure = page.getByRole("main").getByRole("alert").first();
  await expect(notice.or(failure)).toBeVisible({ timeout: 120_000 });
  if (!(await notice.isVisible())) {
    throw new Error(`save was refused: ${await failure.innerText()}`);
  }
}

test.describe("P6 activity authoring and session snapshot", () => {
  // Every step compiles another route under next dev on first use.
  test.setTimeout(900_000);

  test("teacher publishes an activity, opens a session, and the snapshot survives later group changes", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "P6 teacher journey runs once against the local Supabase stack.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `p6-teacher-${suffix}@example.edu`;
    const adaEmail = `p6-ada-${suffix}@example.edu`;
    const boEmail = `p6-bo-${suffix}@example.edu`;
    const cyEmail = `p6-cy-${suffix}@example.edu`;
    const emails = [teacherEmail, adaEmail, boEmail, cyEmail];
    const password = "activity session passphrase 1";
    const env = getLocalSupabaseEnv();
    const schoolId = randomUUID();
    const classId = randomUUID();

    for (const email of emails) {
      await createConfirmedUser(request, env, email, password);
    }

    const emailList = emails.map(sqlLiteral).join(", ");
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

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Field School', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});

      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Field Class', 1, 4, 3, true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    runLocalSql(
      asUserSql(
        adaEmail,
        `select * from public.create_student_group('${classId}'::uuid, 'Leaf', null);`,
      ) +
        asUserSql(
          cyEmail,
          `select * from public.create_student_group('${classId}'::uuid, 'Root', null);`,
        ),
    );
    runLocalSql(`
      insert into public.group_members (class_id, group_id, user_id, role, invited_by)
      select '${classId}'::uuid, grouped.id, bo.id, 'member', ada.id
      from public.groups as grouped
      cross join public.profiles as bo
      cross join public.profiles as ada
      where grouped.class_id = '${classId}'::uuid and grouped.name = 'Leaf'
        and bo.email = ${sqlLiteral(boEmail)}
        and ada.email = ${sqlLiteral(adaEmail)};
    `);

    // The sign-in UI is covered by the auth suite; this journey uses its API.
    const signInResponse = await page.request.post("/api/auth/sign-in", {
      data: { email: teacherEmail, password, returnTo: "/teacher/classes" },
    });
    expect(
      signInResponse.status(),
      `sign-in failed: ${await signInResponse.text()}`,
    ).toBe(200);

    // Create the activity.
    await page.goto(`/teacher/classes/${classId}/activities`);
    await expect(
      page.getByRole("heading", { name: "กิจกรรม" }).first(),
    ).toBeVisible({
      timeout: 120_000,
    });
    const createActivityForm = page.getByRole("form", { name: "สร้างกิจกรรม" });
    await createActivityForm.getByLabel("ชื่อกิจกรรม").fill("Garden survey");
    await createActivityForm
      .getByRole("button", { name: "สร้างกิจกรรม" })
      .click();
    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/, { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { name: "แก้ไขกิจกรรม" }),
    ).toBeVisible();

    // next dev compiles each route on first use; warm the ones this journey
    // needs so a single action never waits for a cold compile.
    const activityId = page.url().split("/").pop();
    await Promise.all([
      page.request.get(`/api/activities/${activityId}`),
      page.request.get(`/api/activities/${activityId}/publish`),
      page.request.get(`/api/sessions?classId=${classId}`),
    ]);

    // Boundary, route, and two checkpoints, one of them outside the boundary.
    await page
      .getByRole("button", { name: "ขอบเขตสำรวจ", exact: true })
      .click();
    await page.getByLabel("ขอบเขตสำรวจ (GeoJSON)").fill(BOUNDARY);
    await expect(page.getByText("อ่านขอบเขตได้ 5 จุด")).toBeVisible();
    await page.getByRole("button", { name: "เส้นทาง", exact: true }).click();
    await page.getByLabel("เส้นทาง (GeoJSON)").fill(ROUTE);
    await expect(page.getByText("อ่านเส้นทางได้ 2 จุด")).toBeVisible();

    await page.getByRole("button", { name: "จุดตรวจ", exact: true }).click();
    for (const [index, checkpoint] of [
      { title: "Start", latitude: "13.7550", longitude: "100.5050" },
      { title: "Outside", latitude: "13.7500", longitude: "100.6000" },
    ].entries()) {
      await page.getByRole("button", { name: "เพิ่มจุดตรวจ" }).click();
      const row = page
        .locator("li", { hasText: `จุดตรวจที่ ${index + 1}` })
        .last();
      await row.getByLabel("ชื่อจุดตรวจ").fill(checkpoint.title);
      await row.getByLabel("ละติจูด").fill(checkpoint.latitude);
      await row.getByLabel("ลองจิจูด").fill(checkpoint.longitude);
    }

    await saveDraft(page, "บันทึกร่างแล้ว · ฉบับที่ 1");

    // Publishing is refused while a checkpoint sits outside the boundary.
    await page
      .getByRole("button", { name: "ตรวจและเผยแพร่", exact: true })
      .click();
    await page.getByRole("button", { name: "เผยแพร่กิจกรรม" }).click();
    await expect(page.getByText("จุดตรวจที่ 2 อยู่นอกขอบเขตสำรวจ")).toBeVisible(
      { timeout: 120_000 },
    );

    await page.getByRole("button", { name: "จุดตรวจ", exact: true }).click();
    const secondCheckpoint = page
      .locator("li", { hasText: "จุดตรวจที่ 2" })
      .last();
    await secondCheckpoint.getByLabel("ละติจูด").fill("13.7570");
    await secondCheckpoint.getByLabel("ลองจิจูด").fill("100.5070");
    await saveDraft(page, "บันทึกร่างแล้ว · ฉบับที่ 1");
    await page
      .getByRole("button", { name: "ตรวจและเผยแพร่", exact: true })
      .click();
    await page.getByRole("button", { name: "เผยแพร่กิจกรรม" }).click();
    await expect(
      page.getByText(
        "เผยแพร่ฉบับที่ 1 แล้ว นักเรียนในชั้นเรียนเห็นกิจกรรมนี้ได้",
      ),
    ).toBeVisible({ timeout: 120_000 });

    // Schedule a session on the published version.
    await page.goto(`/teacher/classes/${classId}/sessions`);
    await expect(
      page.getByRole("heading", { name: "รอบสำรวจ" }).first(),
    ).toBeVisible({
      timeout: 120_000,
    });
    const createSessionForm = page.getByRole("form", {
      name: "ตั้งรอบสำรวจใหม่",
    });
    await createSessionForm
      .getByLabel("กิจกรรมที่เผยแพร่แล้ว")
      .selectOption({ label: "Garden survey · ฉบับที่ 1" });
    await createSessionForm.getByLabel("ชื่อรอบสำรวจ").fill("Morning round");
    await createSessionForm
      .getByRole("button", { name: "ตั้งรอบสำรวจ" })
      .click();
    await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/, { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { name: "ตั้งค่ารอบสำรวจ" }),
    ).toBeVisible();

    // Reorder the queue, then open with the snapshot confirmation.
    await page.getByRole("button", { name: "เลื่อน Root ขึ้น" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Root" }).first(),
    ).toContainText("1");
    await page
      .getByRole("button", { name: "เปิดรอบสำรวจ", exact: true })
      .first()
      .click();
    const confirmDialog = page.getByRole("alertdialog", {
      name: "เปิดรอบสำรวจ Morning round?",
    });
    await expect(confirmDialog).toContainText("บันทึก 2 กลุ่ม นักเรียน 3 คน");
    await confirmDialog
      .getByRole("button", { name: "เปิดรอบสำรวจ", exact: true })
      .click();
    await expect(
      page.getByText("เปิดรอบสำรวจแล้ว · บันทึก 2 กลุ่ม นักเรียน 3 คน"),
    ).toBeVisible({ timeout: 120_000 });
    await expect(
      page.getByRole("region", { name: "1. Root" }).getByText("Cy Leader"),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "2. Leaf" }).getByText("Bo Member"),
    ).toBeVisible();

    // Moving a snapshotted student is refused while the session runs.
    await page.goto(`/teacher/classes/${classId}/groups`);
    const leaf = page.getByRole("region", { name: "Leaf" });
    await leaf
      .getByRole("button", { name: "ย้าย Bo Member", exact: true })
      .click();
    const moveDialog = leaf.getByRole("alertdialog", {
      name: "ย้าย Bo Member",
    });
    await moveDialog.getByRole("radio", { name: /Root/ }).check();
    await moveDialog.getByRole("button", { name: "ย้ายไป Root" }).click();
    await expect(
      moveDialog.getByText("เปลี่ยนกลุ่มไม่ได้ระหว่างกิจกรรม"),
    ).toBeVisible({ timeout: 120_000 });

    // A change made outside the RPCs still leaves the snapshot intact.
    runLocalSql(`
      update public.group_members
      set status = 'left', left_at = now()
      where class_id = '${classId}'::uuid
        and user_id = (select id from public.profiles where email = ${sqlLiteral(boEmail)});
    `);
    expect(
      queryLocalSql(`
        select count(*) from public.session_participants as participant
        join public.exploration_sessions as session_row on session_row.id = participant.session_id
        where session_row.class_id = '${classId}'::uuid;
      `),
    ).toBe("3");

    await page.goto(page.url().replace("/groups", "/sessions"));
    await page.goto(`/teacher/classes/${classId}/sessions`);
    await page
      .getByRole("link", { name: "Morning round", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "2. Leaf" }).getByText("Bo Member"),
    ).toBeVisible({ timeout: 120_000 });
    await expect(
      page.getByText("รายชื่อนี้บันทึกไว้ตอนเปิดรอบ", { exact: false }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });
});
