import { expect, test } from "@playwright/test";

import {
  createConfirmedUser,
  expectNoHorizontalOverflow,
  getLocalSupabaseEnv,
  queryLocalSql,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import { signInContext } from "./support/observation-journey";
import { nextTotpWindow, totpCode } from "./support/totp";

// P15-01 against the local stack: an admin grant alone reaches only the MFA
// step; the admin enrolls a TOTP factor, reaches the audited console, and a
// later sign-in is challenged for a code. A teacher, even with admin-looking
// metadata, and a revoked admin are refused.

test.describe("P15 admin access", () => {
  test.setTimeout(600_000);

  test("grant plus TOTP reaches the audited console; others are refused", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "admin-desktop-chromium",
      "P15 admin journey runs once, on the admin project.",
    );
    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const env = getLocalSupabaseEnv();
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const adminEmail = `p15-admin-${suffix}@example.edu`;
    const teacherEmail = `p15-teacher-${suffix}@example.edu`;
    const password = "admin console passphrase 1";
    await createConfirmedUser(request, env, adminEmail, password);
    await createConfirmedUser(request, env, teacherEmail, password);
    runLocalSql(`
      update public.profiles set account_type = 'teacher'
        where email = ${sqlLiteral(teacherEmail)};
      update auth.users
        set raw_user_meta_data = '{"is_admin":true,"role":"admin"}'::jsonb
        where email = ${sqlLiteral(teacherEmail)};
      insert into public.platform_admins (user_id, status, reason)
        select id, 'active', 'P15 e2e bootstrap'
        from public.profiles where email = ${sqlLiteral(adminEmail)};
    `);

    // 1. The grant alone lands on the MFA step, then enrolls a factor.
    const adminContext = await browser.newContext({ baseURL });
    await signInContext(adminContext, adminEmail, password);
    const admin = await adminContext.newPage();
    await admin.goto("/admin");
    await admin.waitForURL(/\/admin\/mfa\?returnTo=%2Fadmin$/, {
      timeout: 120_000,
    });
    const step = admin.locator("[data-mfa-step]");
    await expect(step).toHaveAttribute("data-mfa-step", "enroll", {
      timeout: 60_000,
    });
    await expect(
      admin.getByRole("heading", { name: "ต้องยืนยันตัวตนสองขั้นตอน" }),
    ).toBeVisible();

    // A wrong code is refused and the field clears.
    const code = admin.getByLabel("รหัสจากแอปยืนยันตัวตน");
    const secretText = admin.locator("[data-mfa-secret]");
    await admin.getByText("สแกนไม่ได้? กรอกรหัสตั้งค่าเอง").click();
    const secret = (await secretText.textContent())!.trim();
    const wrong = String((Number(totpCode(secret)) + 1) % 1_000_000).padStart(
      6,
      "0",
    );
    await code.fill(wrong);
    await admin.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(admin.locator("#admin-mfa-code-error")).toContainText(
      "รหัสไม่ถูกต้องหรือหมดเวลาแล้ว",
    );
    await expect(code).toHaveValue("");

    await code.fill(totpCode(secret));
    await admin.getByRole("button", { name: "ยืนยัน" }).click();
    await admin.waitForURL(/\/admin$/, { timeout: 120_000 });
    await expect(
      admin.getByRole("heading", { name: "ภาพรวมผู้ดูแลระบบ" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(admin.locator("[data-admin-aal]")).toContainText(
      "ทุกการเปิดดูถูกบันทึก",
    );
    expect(
      await queryLocalSql(`
        select count(*) from public.audit_logs
        where action = 'admin.console.viewed'
          and actor_id = (select id from public.profiles where email = ${sqlLiteral(adminEmail)});
      `),
    ).not.toBe("0");

    // The console works on a phone.
    await admin.setViewportSize({ width: 360, height: 800 });
    await admin.reload();
    await expect(
      admin.getByRole("heading", { name: "ภาพรวมผู้ดูแลระบบ" }),
    ).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalOverflow(admin);

    // 2. A new sign-in has aal1 again and is challenged, not re-enrolled.
    await nextTotpWindow();
    const secondContext = await browser.newContext({ baseURL });
    await signInContext(secondContext, adminEmail, password);
    const second = await secondContext.newPage();
    await second.goto("/admin");
    await second.waitForURL(/\/admin\/mfa/, { timeout: 120_000 });
    await expect(second.locator("[data-mfa-step]")).toHaveAttribute(
      "data-mfa-step",
      "verify",
      { timeout: 60_000 },
    );
    await second.getByLabel("รหัสจากแอปยืนยันตัวตน").fill(totpCode(secret));
    await second.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(
      second.getByRole("heading", { name: "ภาพรวมผู้ดูแลระบบ" }),
    ).toBeVisible({ timeout: 120_000 });

    // 3. Revoking the grant ends console access at once.
    runLocalSql(`
      update public.platform_admins
        set status = 'revoked', revoked_at = now(), revoked_by = user_id
        where user_id = (select id from public.profiles where email = ${sqlLiteral(adminEmail)});
    `);
    await second.reload();
    await expect(second.locator("[data-error-code]")).toHaveAttribute(
      "data-error-code",
      "ADMIN_REQUIRED",
    );
    await second.goto("/admin/mfa");
    await expect(second.locator("[data-error-code]")).toHaveAttribute(
      "data-error-code",
      "ADMIN_REQUIRED",
    );

    // 4. A teacher with admin-looking metadata is refused, with no MFA step.
    const teacherContext = await browser.newContext({ baseURL });
    await signInContext(teacherContext, teacherEmail, password);
    const teacher = await teacherContext.newPage();
    await teacher.goto("/admin");
    await expect(teacher.locator("[data-error-code]")).toHaveAttribute(
      "data-error-code",
      "ADMIN_REQUIRED",
      { timeout: 120_000 },
    );
    await expect(teacher).toHaveURL(/\/admin$/);
    await teacher.goto("/admin/mfa");
    await expect(teacher.locator("[data-error-code]")).toHaveAttribute(
      "data-error-code",
      "ADMIN_REQUIRED",
    );

    await Promise.all(
      [adminContext, secondContext, teacherContext].map((context) =>
        context.close(),
      ),
    );
  });
});
