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

async function expectNotice(page: Page, message: string) {
  // The first mutation may wait for next dev to compile its route.
  await expect(page.getByText(message, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("P5 teacher group management", () => {
  // Each teacher action hits a route that next dev compiles on first use.
  test.setTimeout(600_000);

  test("teacher approves, creates, moves a leader with a successor, locks, deletes, and resets a claim", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "P5 teacher journey runs once against the local Supabase stack.",
    );

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const teacherEmail = `manage-teacher-${suffix}@example.edu`;
    const adaEmail = `manage-ada-${suffix}@example.edu`;
    const boEmail = `manage-bo-${suffix}@example.edu`;
    const cyEmail = `manage-cy-${suffix}@example.edu`;
    const emails = [teacherEmail, adaEmail, boEmail, cyEmail];
    const password = "teacher group passphrase 1";
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
      update public.profiles set display_name = 'Cy Student' where email = ${sqlLiteral(cyEmail)};

      insert into public.schools (id, name, created_by)
      select '${schoolId}'::uuid, 'Management School', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.school_memberships (school_id, user_id, role)
      select '${schoolId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});

      insert into public.classes (
        id, school_id, name, min_group_size, max_group_size, maximum_groups,
        allow_student_groups, group_formation_status, created_by
      )
      select '${classId}'::uuid, '${schoolId}'::uuid, 'Management Class', 2, 3, 2,
        true, 'open', id
      from public.profiles where email = ${sqlLiteral(teacherEmail)};

      insert into public.class_members (class_id, user_id, role)
      select '${classId}'::uuid, id,
        case when email = ${sqlLiteral(teacherEmail)} then 'teacher' else 'student' end
      from public.profiles where email in (${emailList});
    `);

    runLocalSql(
      asUserSql(
        adaEmail,
        `select * from public.create_student_group('${classId}'::uuid, 'Leaf Team', null);`,
      ),
    );
    runLocalSql(`
      insert into public.group_members (class_id, group_id, user_id, role, invited_by)
      select '${classId}'::uuid, grouped.id, bo.id, 'member', ada.id
      from public.groups as grouped
      cross join public.profiles as bo
      cross join public.profiles as ada
      where grouped.class_id = '${classId}'::uuid
        and bo.email = ${sqlLiteral(boEmail)}
        and ada.email = ${sqlLiteral(adaEmail)};
    `);

    const path = `/teacher/classes/${classId}/groups`;
    await page.goto(path);
    await page.waitForURL(/\/auth\/sign-in\?/);
    // Sign in through the same API the form uses; filling the form before it
    // hydrates would submit natively and stall this journey. The sign-in UI
    // itself is covered by the auth suite.
    const signInResponse = await page.request.post("/api/auth/sign-in", {
      data: { email: teacherEmail, password, returnTo: path },
    });
    expect(signInResponse.ok()).toBe(true);
    expect((await signInResponse.json()).data.destination).toBe(path);
    await page.goto(path);

    await expect(
      page.getByRole("heading", { name: "จัดการกลุ่ม" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("อัปเดตสดอยู่")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("ใช้แล้ว 1/2 กลุ่ม")).toBeVisible();

    // Approve the student-created group.
    const leaf = page.getByRole("region", { name: "Leaf Team" });
    await leaf.getByRole("button", { name: "อนุมัติกลุ่ม" }).click();
    await expectNotice(page, "อนุมัติกลุ่ม Leaf Team แล้ว");
    await expect(leaf.getByText("ครูอนุมัติแล้ว")).toBeVisible();

    // Create a teacher group that uses the final slot.
    await page.getByRole("button", { name: "สร้างกลุ่ม" }).click();
    const createForm = page.getByRole("form", { name: "สร้างกลุ่มใหม่" });
    await createForm.getByLabel("ชื่อกลุ่ม").fill("Root Team");
    await createForm
      .getByLabel("หัวหน้ากลุ่ม (ไม่บังคับ)")
      .selectOption({ label: "Cy Student" });
    await createForm.getByRole("button", { name: "สร้างกลุ่ม" }).click();
    await expectNotice(
      page,
      "สร้างกลุ่ม Root Team แล้ว · เหลือช่องกลุ่ม 0 กลุ่ม",
    );
    await expect(
      page.getByRole("button", { name: "สร้างกลุ่ม" }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        "ครบจำนวนกลุ่มสูงสุด 2 กลุ่มแล้ว เพิ่มจำนวนกลุ่มในการตั้งค่าชั้นเรียนก่อน",
      ),
    ).toBeVisible();

    // Moving Leaf's leader requires choosing a successor in the same step.
    await leaf
      .getByRole("button", { name: "ย้าย Ada Leader", exact: true })
      .click();
    const moveDialog = leaf.getByRole("alertdialog", {
      name: "ย้าย Ada Leader",
    });
    await moveDialog.getByRole("radio", { name: /Root Team/ }).check();
    await expect(
      moveDialog.getByRole("button", { name: "ย้ายไป Root Team" }),
    ).toBeDisabled();
    await moveDialog.getByRole("radio", { name: "Bo Member" }).check();
    await moveDialog.getByRole("button", { name: "ย้ายไป Root Team" }).click();
    await expectNotice(
      page,
      "ย้าย Ada Leader ไป Root Team แล้ว · กลุ่มเดิมมีหัวหน้าคนใหม่แล้ว",
    );
    expect(
      queryLocalSql(`
          select string_agg(profile.display_name || ':' || grouped.name || ':' || member.role, ',' order by profile.display_name)
          from public.group_members as member
          join public.groups as grouped on grouped.id = member.group_id
          join public.profiles as profile on profile.id = member.user_id
          where member.class_id = '${classId}'::uuid and member.status = 'active';
        `),
    ).toBe(
      "Ada Leader:Root Team:member,Bo Member:Leaf Team:leader,Cy Student:Root Team:leader",
    );

    // Lock and unlock with confirmation.
    const rootGroup = page.getByRole("region", { name: "Root Team" });
    await rootGroup.getByRole("button", { name: "ล็อกกลุ่ม" }).click();
    await rootGroup
      .getByRole("alertdialog", { name: "ล็อกกลุ่ม Root Team?" })
      .getByRole("button", { name: "ล็อกกลุ่ม" })
      .click();
    await expectNotice(page, "ล็อกกลุ่ม Root Team แล้ว");
    await expect(
      rootGroup.getByRole("button", { name: "ย้าย Ada Leader", exact: true }),
    ).toBeDisabled();
    await rootGroup.getByRole("button", { name: "ปลดล็อก" }).click();
    await rootGroup
      .getByRole("alertdialog", { name: "ปลดล็อกกลุ่ม Root Team?" })
      .getByRole("button", { name: "ปลดล็อกกลุ่ม" })
      .click();
    await expectNotice(
      page,
      "ปลดล็อกกลุ่ม Root Team แล้ว · สถานะ กำลังจัดกลุ่ม",
    );

    // Deleting an unused group releases members and restores a slot.
    await leaf.getByRole("button", { name: "ลบกลุ่ม Leaf Team" }).click();
    await leaf
      .getByRole("alertdialog", { name: "ลบกลุ่ม Leaf Team?" })
      .getByRole("button", { name: "ลบกลุ่ม", exact: true })
      .click();
    await expectNotice(
      page,
      "ลบกลุ่ม Leaf Team แล้ว · สมาชิก 1 คนกลับไปยังไม่มีกลุ่ม · เหลือช่องกลุ่ม 1 กลุ่ม",
    );
    await expect(
      page.getByRole("heading", { name: "ยังไม่มีกลุ่ม (1 คน)" }),
    ).toBeVisible();

    // Ada's claim is now resolvable because the claimed group was deleted.
    const claims = page.getByRole("region", {
      name: "สิทธิ์สร้างกลุ่มของนักเรียน",
    });
    await expect(claims.getByText(/กลุ่มเดิมถูกลบแล้ว/)).toBeVisible();
    await claims
      .getByRole("button", { name: "รีเซ็ตสิทธิ์ของ Ada Leader" })
      .click();
    await claims.getByLabel("เหตุผลการรีเซ็ตสิทธิ์").fill("");
    await claims.getByRole("button", { name: "ถัดไป" }).click();
    await expect(claims.getByText("ระบุเหตุผลการรีเซ็ตสิทธิ์")).toBeVisible();
    await claims
      .getByLabel("เหตุผลการรีเซ็ตสิทธิ์")
      .fill("Leaf Team was deleted before any activity");
    await claims.getByRole("button", { name: "ถัดไป" }).click();
    await claims
      .getByRole("alertdialog", {
        name: "รีเซ็ตสิทธิ์สร้างกลุ่มของ Ada Leader?",
      })
      .getByRole("button", { name: "รีเซ็ตสิทธิ์" })
      .click();
    await expect(
      claims.getByText("รีเซ็ตสิทธิ์สร้างกลุ่มของ Ada Leader แล้ว"),
    ).toBeVisible({ timeout: 30_000 });
    const auditLogId = queryLocalSql(`
        select audit.id
        from public.audit_logs as audit
        where audit.class_id = '${classId}'::uuid
          and audit.action = 'group_creation_claim_reset';
      `);
    await expect(claims.getByText(auditLogId)).toBeVisible();
    expect(
      queryLocalSql(`
          select status || ':' || reset_reason
          from public.student_group_creation_claims
          where class_id = '${classId}'::uuid;
        `),
    ).toBe("reset_by_teacher:Leaf Team was deleted before any activity");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });
});
