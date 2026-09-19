import { expect, test, type BrowserContext } from "@playwright/test";

import { adminWithMfa } from "./support/admin";
import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import { signInContext } from "./support/observation-journey";

// P15-02 against the local stack: an aal2 admin creates a school, issues a
// teacher invitation, the invited account accepts it through the one-time
// link, a second invitation is revoked, the directory shows the teacher and
// masks student email, and archiving the school closes provisioning.

test.describe("P15 schools, teacher provisioning, and directory", () => {
  test.setTimeout(600_000);

  test("create school, invite and accept, revoke, directory, archive", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "teacher-desktop-chromium",
      "P15 admin journey runs once, on the desktop project CI runs.",
    );
    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const env = getLocalSupabaseEnv();
    const contexts: BrowserContext[] = [];
    try {
      const {
        context,
        page: admin,
        suffix,
      } = await adminWithMfa(browser, request, baseURL, "directory");
      contexts.push(context);
      const schoolName = `P15 Riverside ${suffix}`;
      const teacherEmail = `p15-invited-teacher-${suffix}@example.edu`;
      const studentEmail = `p15-student-${suffix}@example.edu`;
      const password = "invited teacher passphrase 1";
      await createConfirmedUser(request, env, teacherEmail, password);
      await createConfirmedUser(request, env, studentEmail, password);

      // 1. Create the school; the same name again is refused.
      await admin.goto("/admin/schools");
      const create = admin.getByRole("form", { name: "เพิ่มโรงเรียน" });
      await create.getByLabel("ชื่อโรงเรียน").fill(schoolName);
      await create.getByRole("button", { name: "เพิ่มโรงเรียน" }).click();
      await expect(create.getByRole("status")).toContainText(schoolName);
      await create.getByLabel("ชื่อโรงเรียน").fill(schoolName.toUpperCase());
      await create.getByRole("button", { name: "เพิ่มโรงเรียน" }).click();
      await expect(create.locator("[data-admin-error]")).toHaveAttribute(
        "data-admin-error",
        "SCHOOL_NAME_TAKEN",
      );

      await admin.getByRole("link", { name: new RegExp(schoolName) }).click();
      await admin.waitForURL(/\/admin\/schools\/[0-9a-f-]{36}$/);

      // 2. Issue an invitation and read the one-time link.
      const invite = admin.getByRole("form", { name: "เชิญครู" });
      await invite.getByLabel("อีเมลครู").fill(teacherEmail);
      await invite.getByRole("button", { name: "สร้างคำเชิญ" }).click();
      const link = (await invite
        .locator("[data-invite-link]")
        .textContent({ timeout: 60_000 }))!.trim();
      expect(link).toMatch(/\/teacher-invite\/[A-Za-z0-9_-]{20,128}$/);
      await invite.getByLabel("อีเมลครู").fill(teacherEmail);
      await invite.getByRole("button", { name: "สร้างคำเชิญ" }).click();
      await expect(invite.locator("[data-admin-error]")).toHaveAttribute(
        "data-admin-error",
        "TEACHER_INVITE_INVALID",
      );

      // 3. The invited account accepts through the link.
      const teacherContext = await browser.newContext({ baseURL });
      contexts.push(teacherContext);
      await signInContext(teacherContext, teacherEmail, password);
      const teacher = await teacherContext.newPage();
      await teacher.goto(new URL(link).pathname);
      await expect(
        teacher.getByRole("heading", { name: `รับสิทธิ์ครูที่ ${schoolName}` }),
      ).toBeVisible({ timeout: 120_000 });
      await teacher.getByRole("button", { name: "รับคำเชิญเป็นครู" }).click();
      await teacher.waitForURL(/\/app/, { timeout: 120_000 });
      expect(
        await queryLocalSql(`
          select profile.account_type || '|' || membership.role
          from public.profiles as profile
          join public.school_memberships as membership on membership.user_id = profile.id
          join public.schools as school on school.id = membership.school_id
          where profile.email = ${sqlLiteral(teacherEmail)}
            and school.name = ${sqlLiteral(schoolName)};
        `),
      ).toBe("teacher|teacher");
      // The link is single use.
      await teacher.goto(new URL(link).pathname);
      await expect(teacher.locator("[data-error-code]")).toHaveAttribute(
        "data-error-code",
        "TEACHER_INVITE_INVALID",
        { timeout: 60_000 },
      );

      // 4. A second invitation is revoked with a reason.
      await admin.reload();
      await expect(
        admin.locator('[data-invitation-status="accepted"]'),
      ).toHaveCount(1, { timeout: 60_000 });
      await invite
        .getByLabel("อีเมลครู")
        .fill(`p15-other-${suffix}@example.edu`);
      await invite.getByRole("button", { name: "สร้างคำเชิญ" }).click();
      await expect(invite.locator("[data-invite-issued]")).toBeVisible();
      const pending = admin.locator('[data-invitation-status="pending"]');
      await expect(pending).toHaveCount(1, { timeout: 60_000 });
      await pending.getByRole("button", { name: "ยกเลิกคำเชิญ" }).click();
      await pending.getByLabel("เหตุผลที่ยกเลิก").fill("ส่งผิดอีเมล");
      await pending.getByRole("button", { name: "ยืนยันยกเลิกคำเชิญ" }).click();
      await expect(
        admin.locator('[data-invitation-status="revoked"]'),
      ).toHaveCount(1, { timeout: 60_000 });

      // 5. The directory finds the teacher and masks the student's email.
      await admin.goto("/admin/users");
      await admin.getByLabel("ค้นหาชื่อหรืออีเมล").fill(teacherEmail);
      await admin.getByRole("button", { name: "ค้นหา" }).click();
      const teacherRow = admin.locator('[data-account-type="teacher"]');
      await expect(teacherRow).toHaveCount(1, { timeout: 60_000 });
      await expect(teacherRow).toContainText(teacherEmail);
      await expect(teacherRow).toContainText(schoolName);
      await admin.getByLabel("ค้นหาชื่อหรืออีเมล").fill(studentEmail);
      await admin.getByRole("button", { name: "ค้นหา" }).click();
      const studentRow = admin.locator('[data-account-type="student"]');
      await expect(studentRow).toHaveCount(1, { timeout: 60_000 });
      await expect(studentRow.locator("[data-user-email]")).toHaveText(
        "p***@example.edu",
      );
      await expect(admin.getByText(studentEmail)).toHaveCount(0);
      await admin.setViewportSize({ width: 360, height: 800 });
      await expectNoHorizontalOverflow(admin);
      await admin.setViewportSize({ width: 1440, height: 900 });

      // 6. Archiving closes provisioning for the school.
      await admin.goto("/admin/schools");
      await admin.getByRole("link", { name: new RegExp(schoolName) }).click();
      // The detail loads on the client; wait for it so the click is handled.
      await expect(admin.locator("div[data-school-status]")).toHaveAttribute(
        "data-school-status",
        "active",
        { timeout: 60_000 },
      );
      await admin
        .getByRole("button", { name: "เก็บถาวร", exact: true })
        .click();
      await admin
        .getByLabel(`เหตุผลที่เก็บ “${schoolName}” ถาวร`)
        .fill("ทดสอบการเก็บถาวร");
      await admin.getByRole("button", { name: "ยืนยันเก็บถาวร" }).click();
      await expect(admin.locator("div[data-school-status]")).toHaveAttribute(
        "data-school-status",
        "archived",
        { timeout: 60_000 },
      );
      await expect(admin.getByRole("form", { name: "เชิญครู" })).toHaveCount(0);

      expect(
        Number(
          await queryLocalSql(`
            select count(distinct action) from public.audit_logs
            where actor_id = (select id from public.profiles
              where email = (select email from public.profiles as p
                join public.platform_admins as a on a.user_id = p.id
                where p.email like 'p15-directory-admin-${suffix}%' limit 1))
              and action in ('admin.school.created', 'teacher_invitation_issued',
                'teacher_invitation_revoked', 'admin.directory.listed',
                'admin.school.archived');
          `),
        ),
      ).toBe(5);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
