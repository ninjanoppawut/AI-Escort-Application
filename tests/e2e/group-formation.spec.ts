import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  signIn,
  sqlLiteral,
} from "./support/local-supabase";

test.describe("P3-03 student group board", () => {
  test.setTimeout(180_000);

  test("student creates a group and a classmate sees the disabled slot-limit reason", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P3-03 board journey runs once against the local Supabase stack.",
    );
    await page.context().setOffline(false);

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `board-teacher-${suffix}@example.edu`;
    const leaderEmail = `board-leader-${suffix}@example.edu`;
    const classmateEmail = `board-classmate-${suffix}@example.edu`;
    const emails = [teacherEmail, leaderEmail, classmateEmail];
    const password = "group board passphrase 1";
    const env = getLocalSupabaseEnv();
    const schoolId = randomUUID();
    const classId = randomUUID();
    const boardPath = `/classes/${classId}/groups`;

    for (const email of emails) {
      await createConfirmedUser(request, env, email, password);
    }

    const emailList = emails.map(sqlLiteral).join(", ");
    runLocalSql(`
      update public.profiles
      set email_verified_at = now()
      where email in (${emailList});

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (select id from public.profiles where email in (${emailList}));

      update public.profiles set account_type = 'teacher'
      where email = ${sqlLiteral(teacherEmail)};
      update public.profiles set display_name = 'Ada Leader'
      where email = ${sqlLiteral(leaderEmail)};
      update public.profiles set display_name = 'Bo Classmate'
      where email = ${sqlLiteral(classmateEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Group Board School', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});

      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Group Board Class', 1, 3, 1,
        true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    // A signed-out deep link returns to the board after sign-in.
    await page.goto(boardPath);
    await page.waitForURL(/\/auth\/sign-in\?/);
    await signIn(page, leaderEmail, password);
    await page.waitForURL(new RegExp(`${boardPath}$`));

    await expect(
      page.getByRole("heading", { name: "กลุ่มในชั้นเรียน" }),
    ).toBeVisible();
    await expect(page.getByText("เหลือ 1 กลุ่ม")).toBeVisible();
    await expect(page.getByText("ยังไม่มีกลุ่มในชั้นเรียนนี้")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "สร้างกลุ่มของฉัน" }).click();
    await page.getByLabel("ชื่อกลุ่ม").fill("Leaf Team");
    await page.getByRole("button", { name: "สร้างกลุ่ม", exact: true }).click();

    await expect(page.getByText("สร้างกลุ่ม Leaf Team แล้ว")).toBeVisible();
    await expect(page.getByText("กลุ่มของคุณ")).toBeVisible();
    await expect(page.getByText("คุณเป็นหัวหน้ากลุ่ม").first()).toBeVisible();
    await expect(page.getByText("กำลังจัดกลุ่ม")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
    ).toBeDisabled();
    await expect(
      page.getByText("สร้างไม่ได้เพราะคุณอยู่ในกลุ่มแล้ว"),
    ).toBeVisible();

    expect(
      queryLocalSql(`
        select count(*) || ':' || count(*) filter (where member.role = 'leader')
        from public.groups as group_row
        join public.group_members as member on member.group_id = group_row.id
        where group_row.class_id = '${classId}'::uuid
          and member.status = 'active';
      `),
    ).toBe("1:1");

    const classmateContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      const classmate = await classmateContext.newPage();
      await classmate.goto("/auth/sign-in");
      await signIn(classmate, classmateEmail, password);
      await classmate.waitForURL(/\/app$/);

      await classmate.getByRole("link", { name: "ดูกลุ่มในชั้นเรียน" }).click();
      await classmate.waitForURL(new RegExp(`${boardPath}$`));

      const createButton = classmate.getByRole("button", {
        name: "สร้างกลุ่มของฉัน",
      });
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeDisabled();
      await expect(
        classmate.getByText(
          "สร้างไม่ได้เพราะครบจำนวนกลุ่มสูงสุด 1 กลุ่มแล้ว เข้าร่วมกลุ่มที่ยังว่างหรือรอคำเชิญ",
        ),
      ).toBeVisible();
      await expect(classmate.getByText("เหลือ 0 กลุ่ม")).toBeVisible();
      await expect(classmate.getByText("หัวหน้า: Ada Leader")).toBeVisible();
      await expect(classmate.getByText("ว่าง 2 ที่")).toBeVisible();
      await expect(
        classmate.getByRole("heading", { name: "ยังไม่มีกลุ่ม (1 คน)" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(classmate);
      await expect(classmate.locator("body")).not.toContainText(leaderEmail);
    } finally {
      await classmateContext.close();
    }
  });
});
