import { expect, test, type APIRequestContext } from "@playwright/test";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54624";

interface MailpitList {
  messages: Array<{
    ID: string;
    To: Array<{ Address: string }>;
  }>;
}

interface MailpitMessage {
  HTML?: string;
  Text?: string;
}

async function waitForMail(
  request: APIRequestContext,
  email: string,
  previousId?: string,
) {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailpitUrl}/api/v1/messages`);
        if (!response.ok()) return null;
        const body = (await response.json()) as MailpitList;
        return (
          body.messages.find(
            (message) =>
              message.ID !== previousId &&
              message.To.some(
                (recipient) =>
                  recipient.Address.toLowerCase() === email.toLowerCase(),
              ),
          )?.ID ?? null
        );
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();

  const listResponse = await request.get(`${mailpitUrl}/api/v1/messages`);
  const list = (await listResponse.json()) as MailpitList;
  const messageId = list.messages.find(
    (message) =>
      message.ID !== previousId &&
      message.To.some(
        (recipient) => recipient.Address.toLowerCase() === email.toLowerCase(),
      ),
  )?.ID;
  expect(messageId).toBeTruthy();

  const messageResponse = await request.get(
    `${mailpitUrl}/api/v1/message/${messageId}`,
  );
  const message = (await messageResponse.json()) as MailpitMessage;
  const source = `${message.HTML ?? ""}\n${message.Text ?? ""}`;
  const match = source.match(
    /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/,
  );
  expect(match?.[0]).toBeTruthy();

  return {
    id: messageId as string,
    link: (match?.[0] as string).replaceAll("&amp;", "&"),
  };
}

test.describe("P1-01 local Auth and Mailpit", () => {
  test.setTimeout(90_000);

  test("signup, confirm, protect, sign out, recover, and sign in", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "The stateful Mailpit journey runs once; responsive auth smoke runs in every project.",
    );
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `student-${suffix}@example.edu`;
    const firstPassword = "field learning passphrase 1";
    const secondPassword = "field learning passphrase 2";

    await page.goto("/app");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(
      page.getByText("กรุณาเข้าสู่ระบบ", { exact: true }),
    ).toBeVisible();

    await page.goto("/auth/sign-up");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(firstPassword);
    await page.getByLabel("ยืนยันรหัสผ่าน").fill(firstPassword);
    await page.getByRole("button", { name: "สร้างบัญชีนักเรียน" }).click();
    await expect(page.getByText("ตรวจอีเมลเพื่อยืนยันบัญชี")).toBeVisible();

    const firstConfirmation = await waitForMail(request, email);
    await page.goto("/auth/sign-in");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน").fill(firstPassword);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(
      page.getByText("กรุณายืนยันอีเมล", { exact: true }),
    ).toBeVisible();

    await page.waitForTimeout(1_100);
    await page.goto("/auth/resend-confirmation");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByRole("button", { name: "ส่งอีเมลยืนยันอีกครั้ง" }).click();
    await expect(page.getByText("ตรวจกล่องอีเมลอีกครั้ง")).toBeVisible();
    await expect(page.getByText(/ไม่เปิดเผยว่าอีเมลใดมีบัญชี/)).toBeVisible();

    const confirmation = await waitForMail(
      request,
      email,
      firstConfirmation.id,
    );
    await page.goto(confirmation.link);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText("ยืนยันตัวตนแล้ว · student")).toBeVisible();

    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);

    await page.goto("/auth/forgot-password");
    await page.getByLabel("อีเมล").fill(email);
    await page
      .getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" })
      .click();
    await expect(page.getByText("ตรวจกล่องอีเมลของคุณ")).toBeVisible();

    const recovery = await waitForMail(request, email, confirmation.id);
    await page.goto(recovery.link);
    await expect(page).toHaveURL(/\/auth\/update-password$/);
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(secondPassword);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(secondPassword);
    await page.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
    await expect(page.getByText("ตั้งรหัสผ่านใหม่แล้ว")).toBeVisible();

    await page
      .getByRole("link", { name: "เข้าสู่ระบบด้วยรหัสผ่านใหม่" })
      .click();
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน").fill(secondPassword);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});

test("auth screens are mobile-safe and invalid callbacks recover explicitly", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบ" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);

  await page.goto("/api/auth/callback?flow=signup&next=https://evil.example");
  await expect(page).toHaveURL(/\/auth\/error\?code=AUTH_CALLBACK_INVALID$/);
  await expect(
    page.getByText("ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ"),
  ).toBeVisible();

  await page.goto("/api/auth/callback?flow=recovery");
  await expect(page).toHaveURL(/\/auth\/error\?code=RECOVERY_LINK_INVALID$/);
});
