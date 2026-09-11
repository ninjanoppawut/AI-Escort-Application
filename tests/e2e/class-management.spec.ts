import { expect, test } from "@playwright/test";
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runLocalSql(sql: string) {
  const container = execFileSync(
    "docker",
    [
      "ps",
      "--filter",
      "label=com.supabase.cli.project=ai-escort-application",
      "--filter",
      "name=supabase_db_",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)[0];
  if (!container)
    throw new Error("Local Supabase database container not found");

  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--quiet",
    ],
    { input: sql },
  );
}

function runLocalSqlScalar(sql: string) {
  const container = execFileSync(
    "docker",
    [
      "ps",
      "--filter",
      "label=com.supabase.cli.project=ai-escort-application",
      "--filter",
      "name=supabase_db_",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)[0];
  if (!container)
    throw new Error("Local Supabase database container not found");

  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--quiet",
    ],
    { encoding: "utf8", input: sql },
  ).trim();
}

function getLocalSupabaseEnv() {
  const supabaseCli = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  const quoted =
    process.platform === "win32" ? `"${supabaseCli}"` : supabaseCli;
  const output = execSync(`${quoted} status -o env`, { encoding: "utf8" });
  if (output.trim().startsWith("{")) {
    const parsed = JSON.parse(output) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        typeof value === "string" ? value.replaceAll('"', "") : value,
      ]),
    ) as Record<string, string>;
  }
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([^=]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]?.replaceAll('"', "")]),
  );
}

test.describe("P1-03 teacher class and invite management", () => {
  test.setTimeout(90_000);

  test("teacher mobile workflow creates settings and QR invitations", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P1-03 scoped workflow runs once; layout overflow is checked at mobile width.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const email = `teacher-p103-${suffix}@example.edu`;
    const password = "teacher class passphrase 1";
    const localEnv = getLocalSupabaseEnv();
    const authResponse = await request.post(
      `${localEnv.API_URL}/auth/v1/admin/users`,
      {
        headers: {
          apikey: localEnv.SERVICE_ROLE_KEY,
          authorization: `Bearer ${localEnv.SERVICE_ROLE_KEY}`,
        },
        data: {
          email,
          password,
          email_confirm: true,
          user_metadata: {},
        },
      },
    );
    expect(
      authResponse.ok(),
      `${authResponse.status()} ${await authResponse.text()}`,
    ).toBe(true);

    const schoolId = "10000000-0000-4000-8000-000000000501";
    runLocalSql(`
      update public.profiles
      set account_type = 'teacher', email_verified_at = now()
      where email = ${sqlLiteral(email)};

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id = (
        select id from public.profiles where email = ${sqlLiteral(email)}
      );

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Playwright Field School', id
      from public.profiles
      where email = ${sqlLiteral(email)}
      on conflict (id) do nothing;

      insert into public.school_memberships (school_id, user_id, role, status)
      select '${schoolId}'::uuid, id, 'teacher', 'active'
      from public.profiles
      where email = ${sqlLiteral(email)}
      on conflict on constraint school_memberships_school_user_unique do update
      set role = 'teacher', status = 'active', left_at = null;
    `);

    await page.goto("/auth/sign-in?returnTo=/teacher/classes");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === "/teacher/classes",
    );
    await page.goto("/teacher/classes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const createForm = page.locator("form").filter({
      has: page.locator('input[name="name"]'),
    });
    await createForm.locator('input[name="name"]').fill("Biology M.4/1");
    await createForm.locator('input[name="subject"]').fill("Biology");
    await createForm.locator('input[name="academicYear"]').fill("2569");
    await createForm.locator('input[name="semester"]').fill("2");
    await createForm
      .locator('input[name="groupSettings.minimumSize"]')
      .fill("2");
    await createForm
      .locator('input[name="groupSettings.maximumSize"]')
      .fill("4");
    await createForm
      .locator('input[name="groupSettings.maximumGroups"]')
      .fill("6");
    await createForm
      .locator('select[name="groupSettings.formationStatus"]')
      .selectOption("open");
    await createForm.locator('button[type="submit"]').click();
    await expect(
      page.getByText("สร้างชั้นเรียนและเพิ่มครูเป็นสมาชิกแล้ว"),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "สร้างคำเชิญ" }).click();
    await expect(page.getByText("สร้างคำเชิญแล้ว")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("รหัสชั้นเรียน")).toBeVisible();
    await expect(page.getByAltText("QR invitation")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/\/join\//)).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ปิดคำเชิญ" }).click();
    await expect(page.getByText("ปิดคำเชิญแล้ว")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "สร้างคำเชิญ" }).click();
    await expect(page.getByText("สร้างคำเชิญแล้ว")).toBeVisible({
      timeout: 15_000,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "หมุนคำเชิญ" }).click();
    await expect(page.getByText("หมุนคำเชิญและปิดคำเชิญเดิมแล้ว")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByAltText("QR invitation")).toBeVisible();
  });

  test("student receives permission-denied teacher surface", async ({
    page,
  }) => {
    await page.goto("/teacher/classes");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("student joins class by code and link token", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P1-04 scoped join journey runs once at mobile width.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const teacherEmail = `teacher-p104-${suffix}@example.edu`;
    const studentCodeEmail = `student-p104-code-${suffix}@example.edu`;
    const studentLinkEmail = `student-p104-link-${suffix}@example.edu`;
    const password = "student class join passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [teacherEmail, studentCodeEmail, studentLinkEmail]) {
      const authResponse = await request.post(
        `${localEnv.API_URL}/auth/v1/admin/users`,
        {
          headers: {
            apikey: localEnv.SERVICE_ROLE_KEY,
            authorization: `Bearer ${localEnv.SERVICE_ROLE_KEY}`,
          },
          data: {
            email,
            password,
            email_confirm: true,
            user_metadata: {},
          },
        },
      );
      expect(
        authResponse.ok(),
        `${authResponse.status()} ${await authResponse.text()}`,
      ).toBe(true);
    }

    const inviteCode = `J${suffix.slice(-4).toUpperCase()}-P104`;
    const inviteToken = `token-p104-${suffix}`;
    runLocalSql(`
      update public.profiles
      set email_verified_at = now()
      where email in (
        ${sqlLiteral(teacherEmail)},
        ${sqlLiteral(studentCodeEmail)},
        ${sqlLiteral(studentLinkEmail)}
      );

      update public.profiles
      set account_type = 'teacher'
      where email = ${sqlLiteral(teacherEmail)};

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id
        from public.profiles
        where email in (
          ${sqlLiteral(teacherEmail)},
          ${sqlLiteral(studentCodeEmail)},
          ${sqlLiteral(studentLinkEmail)}
        )
      );

      with teacher as (
        select id from public.profiles where email = ${sqlLiteral(teacherEmail)}
      ),
      inserted_school as (
        insert into public.schools (name, created_by)
        select 'P1-04 Join School', id from teacher
        returning id
      ),
      teacher_school as (
        insert into public.school_memberships (school_id, user_id, role, status)
        select inserted_school.id, teacher.id, 'teacher', 'active'
        from inserted_school, teacher
        returning school_id, user_id
      ),
      inserted_class as (
        insert into public.classes (
          school_id,
          name,
          subject,
          created_by,
          min_group_size,
          max_group_size,
          maximum_groups,
          group_formation_status
        )
        select school_id, 'P1-04 Join Biology', 'Biology', user_id, 2, 4, 4, 'open'
        from teacher_school
        returning id, school_id, created_by
      ),
      teacher_class as (
        insert into public.class_members (class_id, user_id, role, status)
        select id, created_by, 'teacher', 'active'
        from inserted_class
        returning class_id
      )
      insert into public.class_invites (
        class_id,
        code,
        token_hash,
        created_by,
        expires_at,
        max_uses
      )
      select
        inserted_class.id,
        ${sqlLiteral(inviteCode)},
        private.hash_invitation_token(${sqlLiteral(inviteToken)}),
        inserted_class.created_by,
        now() + interval '1 day',
        10
      from inserted_class, teacher_class;
    `);

    await page.goto("/auth/sign-in?returnTo=/join");
    await page.locator('input[type="email"]').fill(studentCodeEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === "/join",
    );
    await page.goto("/join");
    await page.getByLabel("รหัสชั้นเรียน").fill(inviteCode.toLowerCase());
    await page.getByRole("button", { name: "เข้าร่วมชั้นเรียน" }).click();
    await expect(page.getByText("เข้าร่วมชั้นเรียนแล้ว")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("P1-04 Join Biology · P1-04 Join School"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);

    const linkPage = await browser.newPage();
    await linkPage.goto(`/auth/sign-in?returnTo=/join/${inviteToken}`);
    await linkPage.locator('input[type="email"]').fill(studentLinkEmail);
    await linkPage.locator('input[type="password"]').fill(password);
    await linkPage.locator('button[type="submit"]').click();
    await linkPage.waitForURL(
      (url) =>
        url.pathname === "/app" || url.pathname === `/join/${inviteToken}`,
    );
    await linkPage.goto(`/join/${inviteToken}`);
    await expect(
      linkPage.getByRole("heading", {
        name: /เข้าร่วมชั้นเรียนแล้ว|คุณอยู่ในชั้นเรียนนี้แล้ว/,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      linkPage.getByText("P1-04 Join Biology · P1-04 Join School"),
    ).toBeVisible();
    await linkPage.close();
  });

  test("teacher and student view authorized class member lists", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P1-05 scoped member-list journey runs once at mobile width.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const teacherEmail = `teacher-p105-${suffix}@example.edu`;
    const studentAEmail = `student-p105-a-${suffix}@example.edu`;
    const studentBEmail = `student-p105-b-${suffix}@example.edu`;
    const password = "class member list passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [teacherEmail, studentAEmail, studentBEmail]) {
      const authResponse = await request.post(
        `${localEnv.API_URL}/auth/v1/admin/users`,
        {
          headers: {
            apikey: localEnv.SERVICE_ROLE_KEY,
            authorization: `Bearer ${localEnv.SERVICE_ROLE_KEY}`,
          },
          data: {
            email,
            password,
            email_confirm: true,
            user_metadata: {},
          },
        },
      );
      expect(
        authResponse.ok(),
        `${authResponse.status()} ${await authResponse.text()}`,
      ).toBe(true);
    }

    runLocalSql(`
      update public.profiles
      set email_verified_at = now(),
          display_name = case email
            when ${sqlLiteral(teacherEmail)} then 'Teacher P105'
            when ${sqlLiteral(studentAEmail)} then 'Student P105 A'
            when ${sqlLiteral(studentBEmail)} then 'Student P105 B'
            else display_name
          end
      where email in (
        ${sqlLiteral(teacherEmail)},
        ${sqlLiteral(studentAEmail)},
        ${sqlLiteral(studentBEmail)}
      );

      update public.profiles
      set account_type = 'teacher'
      where email = ${sqlLiteral(teacherEmail)};

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id
        from public.profiles
        where email in (
          ${sqlLiteral(teacherEmail)},
          ${sqlLiteral(studentAEmail)},
          ${sqlLiteral(studentBEmail)}
        )
      );

      create temporary table p105_ids as
      select
        gen_random_uuid() as school_id,
        gen_random_uuid() as class_id,
        (select id from public.profiles where email = ${sqlLiteral(teacherEmail)}) as teacher_id,
        (select id from public.profiles where email = ${sqlLiteral(studentAEmail)}) as student_a_id,
        (select id from public.profiles where email = ${sqlLiteral(studentBEmail)}) as student_b_id;

      insert into public.schools (id, name, created_by)
      select school_id, 'P1-05 Member School', teacher_id
      from p105_ids;

      insert into public.school_memberships (school_id, user_id, role, status)
      select school_id, teacher_id, 'teacher', 'active'
      from p105_ids
      union all
      select school_id, student_a_id, 'student', 'active'
      from p105_ids
      union all
      select school_id, student_b_id, 'student', 'active'
      from p105_ids;

      insert into public.classes (
        id,
        school_id,
        name,
        subject,
        created_by,
        min_group_size,
        max_group_size,
        maximum_groups,
        group_formation_status
      )
      select class_id, school_id, 'P1-05 Member Biology', 'Biology', teacher_id, 2, 4, 4, 'open'
      from p105_ids;

      insert into public.class_members (class_id, user_id, role, status)
      select class_id, teacher_id, 'teacher', 'active'
      from p105_ids
      union all
      select class_id, student_a_id, 'student', 'active'
      from p105_ids
      union all
      select class_id, student_b_id, 'student', 'active'
      from p105_ids;
    `);

    await page.goto("/auth/sign-in?returnTo=/teacher/classes");
    await page.locator('input[type="email"]').fill(teacherEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === "/teacher/classes",
    );
    await page.goto("/teacher/classes");
    await expect(
      page.getByRole("heading", { name: "P1-05 Member Biology" }),
    ).toBeVisible();
    await expect(page.getByText("Student P105 A")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(studentAEmail)).toBeVisible();
    await expect(page.getByText("ยังไม่มีกลุ่ม").first()).toBeVisible();

    const studentPage = await browser.newPage();
    await studentPage.goto("/auth/sign-in?returnTo=/app");
    await studentPage.locator('input[type="email"]').fill(studentAEmail);
    await studentPage.locator('input[type="password"]').fill(password);
    await studentPage.locator('button[type="submit"]').click();
    await studentPage.waitForURL((url) => url.pathname === "/app");
    await expect(
      studentPage.getByRole("heading", { name: "P1-05 Member Biology" }),
    ).toBeVisible();
    await expect(studentPage.getByText("Student P105 B")).toBeVisible({
      timeout: 15_000,
    });
    await expect(studentPage.getByText(studentBEmail)).toHaveCount(0);
    await expect(studentPage.getByText(teacherEmail)).toHaveCount(0);
    expect(
      await studentPage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await studentPage.close();
  });

  test("student join replay denies cross-class and teacher-route access", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P1-06 scoped auth/classes regression runs once at mobile width.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const teacherAEmail = `teacher-p106-a-${suffix}@example.edu`;
    const teacherBEmail = `teacher-p106-b-${suffix}@example.edu`;
    const studentEmail = `student-p106-${suffix}@example.edu`;
    const password = "class rls regression passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [teacherAEmail, teacherBEmail, studentEmail]) {
      const authResponse = await request.post(
        `${localEnv.API_URL}/auth/v1/admin/users`,
        {
          headers: {
            apikey: localEnv.SERVICE_ROLE_KEY,
            authorization: `Bearer ${localEnv.SERVICE_ROLE_KEY}`,
          },
          data: {
            email,
            password,
            email_confirm: true,
            user_metadata: email === studentEmail ? { role: "teacher" } : {},
          },
        },
      );
      expect(
        authResponse.ok(),
        `${authResponse.status()} ${await authResponse.text()}`,
      ).toBe(true);
    }

    const schoolAId = randomUUID();
    const schoolBId = randomUUID();
    const classAId = randomUUID();
    const classBId = randomUUID();
    const inviteCode = `P${suffix.slice(-4).toUpperCase()}-106`;
    const inviteToken = `token-p106-${suffix}`;

    runLocalSql(`
      update public.profiles
      set email_verified_at = now(),
          display_name = case email
            when ${sqlLiteral(teacherAEmail)} then 'Teacher P106 A'
            when ${sqlLiteral(teacherBEmail)} then 'Teacher P106 B'
            when ${sqlLiteral(studentEmail)} then 'Student P106'
            else display_name
          end
      where email in (
        ${sqlLiteral(teacherAEmail)},
        ${sqlLiteral(teacherBEmail)},
        ${sqlLiteral(studentEmail)}
      );

      update public.profiles
      set account_type = 'teacher'
      where email in (${sqlLiteral(teacherAEmail)}, ${sqlLiteral(teacherBEmail)});

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id
        from public.profiles
        where email in (
          ${sqlLiteral(teacherAEmail)},
          ${sqlLiteral(teacherBEmail)},
          ${sqlLiteral(studentEmail)}
        )
      );

      create temporary table p106_ids as
      select
        ${sqlLiteral(schoolAId)}::uuid as school_a_id,
        ${sqlLiteral(schoolBId)}::uuid as school_b_id,
        ${sqlLiteral(classAId)}::uuid as class_a_id,
        ${sqlLiteral(classBId)}::uuid as class_b_id,
        (select id from public.profiles where email = ${sqlLiteral(teacherAEmail)}) as teacher_a_id,
        (select id from public.profiles where email = ${sqlLiteral(teacherBEmail)}) as teacher_b_id;

      insert into public.schools (id, name, created_by)
      select school_a_id, 'P1-06 Join School A', teacher_a_id
      from p106_ids
      union all
      select school_b_id, 'P1-06 Join School B', teacher_b_id
      from p106_ids;

      insert into public.school_memberships (school_id, user_id, role, status)
      select school_a_id, teacher_a_id, 'teacher', 'active'
      from p106_ids
      union all
      select school_b_id, teacher_b_id, 'teacher', 'active'
      from p106_ids;

      insert into public.classes (
        id,
        school_id,
        name,
        subject,
        created_by,
        min_group_size,
        max_group_size,
        maximum_groups,
        group_formation_status
      )
      select class_a_id, school_a_id, 'P1-06 Join Biology A', 'Biology', teacher_a_id, 2, 4, 4, 'open'
      from p106_ids
      union all
      select class_b_id, school_b_id, 'P1-06 Join Biology B', 'Biology', teacher_b_id, 2, 4, 4, 'open'
      from p106_ids;

      insert into public.class_members (class_id, user_id, role, status)
      select class_a_id, teacher_a_id, 'teacher', 'active'
      from p106_ids
      union all
      select class_b_id, teacher_b_id, 'teacher', 'active'
      from p106_ids;

      insert into public.class_invites (
        class_id,
        code,
        token_hash,
        created_by,
        expires_at,
        max_uses
      )
      select
        class_a_id,
        ${sqlLiteral(inviteCode)},
        private.hash_invitation_token(${sqlLiteral(inviteToken)}),
        teacher_a_id,
        now() + interval '1 day',
        10
      from p106_ids;
    `);

    await page.goto(`/auth/sign-in?returnTo=/join/${inviteToken}`);
    await page.locator('input[type="email"]').fill(studentEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/app" || url.pathname === `/join/${inviteToken}`,
    );
    await page.goto(`/join/${inviteToken}`);
    await expect(
      page.getByText("P1-06 Join Biology A · P1-06 Join School A"),
    ).toBeVisible({ timeout: 15_000 });

    const replay = await page.evaluate(async (code) => {
      const response = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      return { status: response.status, body: await response.json() };
    }, inviteCode.toLowerCase());
    expect(replay.status).toBe(200);
    expect(replay.body.error).toBeNull();
    expect(replay.body.data.already_joined).toBe(true);
    expect(replay.body.data.role).toBe("student");

    const crossClass = await page.evaluate(async (classId) => {
      const response = await fetch(
        `/api/classes/${classId}/members?status=active&limit=50`,
      );
      return { status: response.status, body: await response.json() };
    }, classBId);
    expect(crossClass.status).toBe(403);
    expect(crossClass.body.error.code).toBe("FORBIDDEN");

    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "P1-06 Join Biology A" }),
    ).toBeVisible();
    await expect(page.getByText("P1-06 Join Biology B")).toHaveCount(0);

    await page.goto("/teacher/classes");
    await expect(page.getByText("คุณไม่มีสิทธิ์ทำรายการนี้")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });

  test("P1-EXIT admin-provisioned teacher creates class and students join by code and QR link", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P1-EXIT acceptance journey runs once against local Supabase/Mailpit.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const adminEmail = `admin-p1exit-${suffix}@example.edu`;
    const teacherEmail = `teacher-p1exit-${suffix}@example.edu`;
    const studentCodeEmail = `student-p1exit-code-${suffix}@example.edu`;
    const studentLinkEmail = `student-p1exit-link-${suffix}@example.edu`;
    const password = "phase one exit passphrase 1";
    const schoolId = randomUUID();
    const otherClassId = randomUUID();
    const localEnv = getLocalSupabaseEnv();
    await page.context().setOffline(false);

    for (const email of [
      adminEmail,
      teacherEmail,
      studentCodeEmail,
      studentLinkEmail,
    ]) {
      const authResponse = await request.post(
        `${localEnv.API_URL}/auth/v1/admin/users`,
        {
          headers: {
            apikey: localEnv.SERVICE_ROLE_KEY,
            authorization: `Bearer ${localEnv.SERVICE_ROLE_KEY}`,
          },
          data: {
            email,
            password,
            email_confirm: true,
            user_metadata: email === teacherEmail ? { role: "teacher" } : {},
          },
        },
      );
      expect(
        authResponse.ok(),
        `${authResponse.status()} ${await authResponse.text()}`,
      ).toBe(true);
    }

    runLocalSql(`
      update public.profiles
      set email_verified_at = now(),
          display_name = case email
            when ${sqlLiteral(adminEmail)} then 'P1 Exit Admin'
            when ${sqlLiteral(teacherEmail)} then 'P1 Exit Teacher'
            when ${sqlLiteral(studentCodeEmail)} then 'P1 Exit Code Student'
            when ${sqlLiteral(studentLinkEmail)} then 'P1 Exit Link Student'
            else display_name
          end
      where email in (
        ${sqlLiteral(adminEmail)},
        ${sqlLiteral(teacherEmail)},
        ${sqlLiteral(studentCodeEmail)},
        ${sqlLiteral(studentLinkEmail)}
      );

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id
        from public.profiles
        where email in (
          ${sqlLiteral(adminEmail)},
          ${sqlLiteral(teacherEmail)},
          ${sqlLiteral(studentCodeEmail)},
          ${sqlLiteral(studentLinkEmail)}
        )
      );

      insert into public.schools (id, name, created_by)
      select ${sqlLiteral(schoolId)}::uuid, 'P1 Exit Field School', id
      from public.profiles
      where email = ${sqlLiteral(adminEmail)};

      insert into public.platform_admins (user_id, granted_by, reason)
      select id, id, 'local P1-EXIT bootstrap grant'
      from public.profiles
      where email = ${sqlLiteral(adminEmail)};
    `);

    await page.goto("/auth/sign-in?returnTo=/teacher/classes");
    await page.locator('input[type="email"]').fill(teacherEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === "/teacher/classes",
    );
    await page.goto("/teacher/classes");

    const deniedCreate = await page.evaluate(async (school) => {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolId: school,
          name: "Denied P1 Exit Class",
          subject: "Biology",
          academicYear: "2569",
          semester: "1",
          description: "",
          groupSettings: {
            minimumSize: 2,
            maximumSize: 4,
            maximumGroups: 4,
            allowStudentGroups: true,
            formationStatus: "open",
          },
        }),
      });
      return { status: response.status, body: await response.json() };
    }, schoolId);
    expect(deniedCreate.status).toBe(403);
    expect(deniedCreate.body.error.code).toBe("FORBIDDEN");

    const teacherInvitationToken = runLocalSqlScalar(`
      begin;
      do $$
      begin
        perform set_config(
          'request.jwt.claims',
          jsonb_build_object(
            'sub',
            (select id from public.profiles where email = ${sqlLiteral(adminEmail)}),
            'role',
            'authenticated',
            'aal',
            'aal2'
          )::text,
          true
        );
      end
      $$;
      set local role authenticated;
      select token
      from public.issue_teacher_invitation(
        ${sqlLiteral(schoolId)}::uuid,
        ${sqlLiteral(teacherEmail)},
        now() + interval '1 day'
      );
      commit;
    `);
    expect(teacherInvitationToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const consumedTeacherInvitation = runLocalSqlScalar(`
      begin;
      do $$
      begin
        perform set_config(
          'request.jwt.claims',
          jsonb_build_object(
            'sub',
            (select id from public.profiles where email = ${sqlLiteral(teacherEmail)}),
            'role',
            'authenticated',
            'aal',
            'aal1'
          )::text,
          true
        );
      end
      $$;
      set local role authenticated;
      select account_type || ':' || membership_role
      from public.consume_teacher_invitation(${sqlLiteral(teacherInvitationToken)});

      reset role;
      insert into public.classes (
        id,
        school_id,
        name,
        subject,
        created_by,
        min_group_size,
        max_group_size,
        maximum_groups,
        group_formation_status
      )
      select
        ${sqlLiteral(otherClassId)}::uuid,
        ${sqlLiteral(schoolId)}::uuid,
        'P1 Exit Other Biology',
        'Biology',
        id,
        2,
        4,
        4,
        'open'
      from public.profiles
      where email = ${sqlLiteral(teacherEmail)};
      commit;
    `);
    expect(consumedTeacherInvitation).toBe("teacher:teacher");

    await page.goto("/teacher/classes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const createForm = page.locator("form").filter({
      has: page.locator('input[name="name"]'),
    });
    await createForm.locator('input[name="name"]').fill("P1 Exit Biology");
    await createForm.locator('input[name="subject"]').fill("Biology");
    await createForm.locator('input[name="academicYear"]').fill("2569");
    await createForm.locator('input[name="semester"]').fill("1");
    await createForm
      .locator('input[name="groupSettings.minimumSize"]')
      .fill("2");
    await createForm
      .locator('input[name="groupSettings.maximumSize"]')
      .fill("4");
    await createForm
      .locator('input[name="groupSettings.maximumGroups"]')
      .fill("4");
    await createForm
      .locator('select[name="groupSettings.formationStatus"]')
      .selectOption("open");
    await createForm.locator('button[type="submit"]').click();
    await expect(
      page.getByRole("button", { name: /P1 Exit Biology/ }),
    ).toBeVisible({ timeout: 15_000 });

    const issuedInvite = await page.evaluate(async () => {
      const classesResponse = await fetch("/api/classes");
      const classesBody = await classesResponse.json();
      const classId = classesBody.data.items.find(
        (item: { name: string }) => item.name === "P1 Exit Biology",
      )?.id;
      const inviteResponse = await fetch(`/api/classes/${classId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: null, maxUses: null }),
      });
      return {
        status: inviteResponse.status,
        body: await inviteResponse.json(),
      };
    });
    expect(issuedInvite.status).toBe(201);
    const inviteCode = issuedInvite.body.data.code as string;
    expect(inviteCode).toMatch(/^[A-Z0-9-]{6,32}$/);
    const joinToken = (issuedInvite.body.data.join_url as string).match(
      /\/join\/([^/?\s]+)/,
    )?.[1];
    expect(joinToken).toBeTruthy();

    await page.context().clearCookies();
    await page.goto("/auth/sign-in?returnTo=/join");
    await page.locator('input[type="email"]').fill(studentCodeEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === "/join",
    );
    await page.goto("/join");
    await page.locator('input[name="inviteCode"]').fill(inviteCode!);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("main")).toContainText("P1 Exit Biology", {
      timeout: 15_000,
    });
    await expect(page.locator("main")).toContainText("P1 Exit Field School");

    const roleEscalation = await page.evaluate(async (code) => {
      const response = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCode: code, role: "teacher" }),
      });
      return { status: response.status, body: await response.json() };
    }, inviteCode);
    expect(roleEscalation.status).toBe(422);
    expect(roleEscalation.body.error.code).toBe("INVITE_INVALID");

    const replay = await page.evaluate(async (code) => {
      const response = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      return { status: response.status, body: await response.json() };
    }, inviteCode);
    expect(replay.status).toBe(200);
    expect(replay.body.data.already_joined).toBe(true);
    expect(replay.body.data.role).toBe("student");

    const crossClass = await page.evaluate(async (classId) => {
      const response = await fetch(
        `/api/classes/${classId}/members?status=active&limit=50`,
      );
      return { status: response.status, body: await response.json() };
    }, otherClassId);
    expect(crossClass.status).toBe(403);
    expect(crossClass.body.error.code).toBe("FORBIDDEN");

    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "P1 Exit Biology" }),
    ).toBeVisible();
    await expect(page.getByText("P1 Exit Other Biology")).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto(`/auth/sign-in?returnTo=/join/${joinToken}`);
    await page.locator('input[type="email"]').fill(studentLinkEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/app" || url.pathname === `/join/${joinToken}`,
    );
    await page.goto(`/join/${joinToken}`);
    await expect(page.locator("main")).toContainText("P1 Exit Biology", {
      timeout: 15_000,
    });
    await expect(page.locator("main")).toContainText("P1 Exit Field School");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });
});
