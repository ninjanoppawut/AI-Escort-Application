import { expect, type APIRequestContext, type Browser } from "@playwright/test";

import {
  createConfirmedUser,
  getLocalSupabaseEnv,
  runLocalSql,
  sqlLiteral,
} from "./local-supabase";
import { signInContext } from "./observation-journey";
import { totpCode } from "./totp";

// A platform admin on the local stack: confirmed account, bootstrap grant,
// TOTP enrolled through the real /admin/mfa step, and an aal2 session.

export async function adminWithMfa(
  browser: Browser,
  request: APIRequestContext,
  baseURL: string,
  label: string,
) {
  const env = getLocalSupabaseEnv();
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const email = `p15-${label}-admin-${suffix}@example.edu`;
  const password = "admin console passphrase 1";
  await createConfirmedUser(request, env, email, password);
  runLocalSql(`
    insert into public.platform_admins (user_id, status, reason)
      select id, 'active', 'P15 e2e bootstrap'
      from public.profiles where email = ${sqlLiteral(email)};
  `);

  const context = await browser.newContext({ baseURL });
  await signInContext(context, email, password);
  const page = await context.newPage();
  await page.goto("/admin/mfa");
  await expect(page.locator("[data-mfa-step]")).toHaveAttribute(
    "data-mfa-step",
    "enroll",
    { timeout: 120_000 },
  );
  await page.getByText("สแกนไม่ได้? กรอกรหัสตั้งค่าเอง").click();
  const secret = (await page
    .locator("[data-mfa-secret]")
    .textContent())!.trim();
  await page.getByLabel("รหัสจากแอปยืนยันตัวตน").fill(totpCode(secret));
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมผู้ดูแลระบบ" }),
  ).toBeVisible({ timeout: 120_000 });
  return { context, page, email, secret, suffix };
}
