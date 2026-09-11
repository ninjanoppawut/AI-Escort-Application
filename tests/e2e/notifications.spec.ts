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

function getLocalDatabaseContainer() {
  return execFileSync(
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
}

function restartLocalDatabase() {
  const container = getLocalDatabaseContainer();
  if (!container)
    throw new Error("Local Supabase database container not found");

  execFileSync("docker", ["restart", "--time", "10", container], {
    encoding: "utf8",
    timeout: 120_000,
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      execFileSync(
        "docker",
        [
          "exec",
          container,
          "pg_isready",
          "--username",
          "postgres",
          "--dbname",
          "postgres",
        ],
        { encoding: "utf8", timeout: 15_000 },
      );
      return;
    } catch {
      execFileSync(
        process.platform === "win32" ? "powershell" : "sleep",
        process.platform === "win32"
          ? ["-NoProfile", "-Command", "Start-Sleep -Seconds 1"]
          : ["1"],
      );
    }
  }

  throw new Error("Local Supabase database did not become ready after restart");
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

test.describe("P2-02 notification APIs", () => {
  test.setTimeout(90_000);

  test("recipient lists unread count and marks one/all read without cross-user access", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P2-02 API/RLS journey runs once against the local Supabase stack.",
    );
    await page.context().setOffline(false);

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const ownerEmail = `notify-owner-${suffix}@example.edu`;
    const otherEmail = `notify-other-${suffix}@example.edu`;
    const password = "notification passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [ownerEmail, otherEmail]) {
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

    const classId = "20000000-0000-4000-8000-000000000902";
    const ownerNotificationId = "50000000-0000-4000-8000-000000000901";
    const secondOwnerNotificationId = "50000000-0000-4000-8000-000000000902";
    const otherNotificationId = "50000000-0000-4000-8000-000000000903";

    runLocalSql(`
      update public.profiles
      set email_verified_at = now()
      where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)});

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id from public.profiles
        where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)})
      );

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${ownerNotificationId}'::uuid, id, 'class_joined', 'First', 'First notification',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '1 minute'
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${secondOwnerNotificationId}'::uuid, id, 'class_joined', 'Second', 'Second notification',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '2 minutes'
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${otherNotificationId}'::uuid, id, 'class_joined', 'Other', 'Other notification',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '3 minutes'
      from public.profiles
      where email = ${sqlLiteral(otherEmail)};
    `);

    await page.goto("/auth/sign-in");
    await page.locator('input[type="email"]').fill(ownerEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app$/);

    const firstPage = await page.evaluate(async () => {
      const response = await fetch("/api/notifications?limit=1");
      return {
        status: response.status,
        body: (await response.json()) as {
          data: {
            items: Array<{ id: string; deepLink: string | null }>;
            unreadCount: number;
            hasMore: boolean;
            nextCursor: string | null;
          };
        },
      };
    });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.unreadCount).toBe(2);
    expect(firstPage.body.data.items).toHaveLength(1);
    expect(firstPage.body.data.items[0]?.id).toBe(ownerNotificationId);
    expect(firstPage.body.data.items[0]?.deepLink).toBe(`/classes/${classId}`);
    expect(firstPage.body.data.hasMore).toBe(true);
    expect(firstPage.body.data.nextCursor).toBeTruthy();
    const nextCursor = firstPage.body.data.nextCursor;
    if (!nextCursor) throw new Error("Expected notification next cursor");

    const secondPage = await page.evaluate(async (cursor) => {
      const response = await fetch(
        `/api/notifications?limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      return {
        status: response.status,
        body: (await response.json()) as {
          data: { items: Array<{ id: string }>; hasMore: boolean };
        },
      };
    }, nextCursor);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.items[0]?.id).toBe(secondOwnerNotificationId);

    const markOther = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      return response.status;
    }, otherNotificationId);
    expect(markOther).toBe(404);

    const markOne = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      return {
        status: response.status,
        body: (await response.json()) as { data: { id: string } },
      };
    }, ownerNotificationId);
    expect(markOne.status).toBe(200);
    expect(markOne.body.data.id).toBe(ownerNotificationId);

    const afterOne = await page.evaluate(async () => {
      const response = await fetch("/api/notifications?status=unread");
      return (await response.json()) as {
        data: { items: Array<{ id: string }>; unreadCount: number };
      };
    });
    expect(afterOne.data.unreadCount).toBe(1);
    expect(afterOne.data.items.map((item) => item.id)).toEqual([
      secondOwnerNotificationId,
    ]);

    const markAll = await page.evaluate(async () => {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
      });
      return {
        status: response.status,
        body: (await response.json()) as {
          data: { updatedCount: number };
        },
      };
    });
    expect(markAll.status).toBe(200);
    expect(markAll.body.data.updatedCount).toBe(1);

    const afterAll = await page.evaluate(async () => {
      const response = await fetch("/api/notifications");
      return (await response.json()) as { data: { unreadCount: number } };
    });
    expect(afterAll.data.unreadCount).toBe(0);
  });
});

test.describe("P2-05 notification browser behavior", () => {
  test.setTimeout(120_000);

  test("notification center persists rows, isolates recipients, refetches on private signals, and renders deep-link states", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P2-05 browser/Reatime journey runs once against the local Supabase stack.",
    );
    await page.context().setOffline(false);

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const ownerEmail = `notify-ui-owner-${suffix}@example.edu`;
    const otherEmail = `notify-ui-other-${suffix}@example.edu`;
    const password = "notification passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [ownerEmail, otherEmail]) {
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

    const classId = randomUUID();
    const initialNotificationId = randomUUID();
    const deletedTargetNotificationId = randomUUID();
    const otherNotificationId = randomUUID();
    const realtimeNotificationId = randomUUID();
    const initialTitle = `Persistent notification ${suffix}`;
    const deletedTargetTitle = `Deleted target ${suffix}`;
    const otherTitle = `Other user notification ${suffix}`;
    const realtimeTitle = `Realtime notification ${suffix}`;

    runLocalSql(`
      update public.profiles
      set email_verified_at = now()
      where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)});

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id from public.profiles
        where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)})
      );

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${initialNotificationId}'::uuid, id, 'class_joined',
        ${sqlLiteral(initialTitle)}, 'Open the class from this notification',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '2 minutes'
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${deletedTargetNotificationId}'::uuid, id, 'group_invitation_received',
        ${sqlLiteral(deletedTargetTitle)}, 'This target is no longer available',
        '{}'::jsonb, now() - interval '1 minute'
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${otherNotificationId}'::uuid, id, 'class_joined',
        ${sqlLiteral(otherTitle)}, 'Other user only',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '3 minutes'
      from public.profiles
      where email = ${sqlLiteral(otherEmail)};
    `);

    await page.goto("/auth/sign-in");
    await page.locator('input[type="email"]').fill(ownerEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole("link", { name: /แจ้งเตือน/ })).toContainText(
      "แจ้งเตือน",
    );

    await page.getByRole("link", { name: /แจ้งเตือน/ }).click();
    await page.waitForURL(/\/notifications$/);
    await expect(
      page.getByRole("heading", { name: "การแจ้งเตือน" }),
    ).toBeVisible();
    await expect(page.getByText(initialTitle)).toBeVisible();
    await expect(page.getByText(deletedTargetTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /ดูรายละเอียด/ }),
    ).toHaveAttribute("href", `/classes/${classId}`);
    await expect(page.getByText("ปลายทางถูกลบหรือหมดอายุ")).toBeVisible();

    await page.reload();
    await expect(page.getByText(initialTitle)).toBeVisible();
    await page
      .getByRole("button", {
        name: "ทำเครื่องหมายว่าอ่านแล้ว",
      })
      .first()
      .click();
    await expect(page.getByText("อ่านแล้ว").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(initialTitle)).toBeVisible();
    await expect(page.getByText("อ่านแล้ว").first()).toBeVisible();

    const crossUserMark = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      return response.status;
    }, otherNotificationId);
    expect(crossUserMark).toBe(404);

    const crossClassDestination = await page.evaluate(async (targetClassId) => {
      const response = await fetch(
        `/api/classes/${targetClassId}/members?status=active&limit=1`,
      );
      return response.status;
    }, classId);
    expect([403, 404]).toContain(crossClassDestination);

    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Boolean(
              (
                window as Window & {
                  __notificationRealtimeEvents?: Array<{
                    type: string;
                    status?: string;
                  }>;
                }
              ).__notificationRealtimeEvents?.some(
                (event) =>
                  event.type === "status" && event.status === "SUBSCRIBED",
              ),
            ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);

    runLocalSql(`
      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${realtimeNotificationId}'::uuid, id, 'same_species_warning',
        ${sqlLiteral(realtimeTitle)}, 'Realtime should invalidate and refetch',
        jsonb_build_object('observationId', '${randomUUID()}'::text), now()
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};
    `);

    await expect
      .poll(
        async () =>
          page.evaluate(
            (id) =>
              Boolean(
                (
                  window as Window & {
                    __notificationRealtimeEvents?: Array<{
                      type: string;
                      notificationId?: string;
                    }>;
                  }
                ).__notificationRealtimeEvents?.some(
                  (event) =>
                    event.type === "broadcast" && event.notificationId === id,
                ),
              ),
            realtimeNotificationId,
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(page.getByText(realtimeTitle)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(otherTitle)).toHaveCount(0);

    await page.getByRole("link", { name: "กลับหน้าหลัก" }).click();
    await page.waitForURL(/\/app$/);
    await page.getByRole("button", { name: /ออกจากระบบ/ }).click();
    await page.waitForURL(/\/auth\/sign-in/);

    await page.locator('input[type="email"]').fill(otherEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app$/);
    await page.goto("/notifications");
    await expect(page.getByText(otherTitle)).toBeVisible();
    await expect(page.getByText(initialTitle)).toHaveCount(0);
    await expect(page.getByText(realtimeTitle)).toHaveCount(0);
  });
});

test.describe("P2-EXIT notification durability", () => {
  test.setTimeout(240_000);

  test("notifications survive a local database restart and remain recipient-scoped", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P2-EXIT restart journey runs once against the local Supabase stack.",
    );
    await page.context().setOffline(false);

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const ownerEmail = `notify-restart-owner-${suffix}@example.edu`;
    const otherEmail = `notify-restart-other-${suffix}@example.edu`;
    const password = "notification passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [ownerEmail, otherEmail]) {
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

    const classId = randomUUID();
    const ownerNotificationId = randomUUID();
    const otherNotificationId = randomUUID();
    const ownerTitle = `Restart survivor ${suffix}`;
    const otherTitle = `Other restart survivor ${suffix}`;

    runLocalSql(`
      update public.profiles
      set email_verified_at = now()
      where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)});

      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email_verified', true)
      where user_id in (
        select id from public.profiles
        where email in (${sqlLiteral(ownerEmail)}, ${sqlLiteral(otherEmail)})
      );

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${ownerNotificationId}'::uuid, id, 'class_joined',
        ${sqlLiteral(ownerTitle)}, 'This row must survive database restart',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '1 minute'
      from public.profiles
      where email = ${sqlLiteral(ownerEmail)};

      insert into public.notifications (id, recipient_id, type, title, message, payload, created_at)
      select '${otherNotificationId}'::uuid, id, 'class_joined',
        ${sqlLiteral(otherTitle)}, 'This row belongs to another recipient',
        jsonb_build_object('classId', '${classId}'::text), now() - interval '2 minutes'
      from public.profiles
      where email = ${sqlLiteral(otherEmail)};
    `);

    restartLocalDatabase();

    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${localEnv.API_URL}/auth/v1/settings`,
            {
              headers: { apikey: localEnv.PUBLISHABLE_KEY },
            },
          );
          return response.status();
        },
        { timeout: 60_000 },
      )
      .toBeLessThan(500);

    await page.goto("/auth/sign-in");
    await page.locator('input[type="email"]').fill(ownerEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app$/);

    await page.goto("/notifications");
    await expect(page.getByText(ownerTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).toHaveCount(0);

    const ownerPage = await page.evaluate(async () => {
      const response = await fetch("/api/notifications");
      return {
        status: response.status,
        body: (await response.json()) as {
          data: { items: Array<{ id: string }>; unreadCount: number };
        },
      };
    });
    expect(ownerPage.status).toBe(200);
    expect(ownerPage.body.data.items.map((item) => item.id)).toContain(
      ownerNotificationId,
    );
    expect(ownerPage.body.data.items.map((item) => item.id)).not.toContain(
      otherNotificationId,
    );

    const crossUserMark = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      return response.status;
    }, otherNotificationId);
    expect(crossUserMark).toBe(404);

    const markOwner = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      return response.status;
    }, ownerNotificationId);
    expect(markOwner).toBe(200);

    const signOut = await page.evaluate(async () => {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.status;
    });
    expect(signOut).toBe(200);
    await page.goto("/auth/sign-in");

    await page.locator('input[type="email"]').fill(otherEmail);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app$/);
    await page.goto("/notifications");
    await expect(page.getByText(otherTitle)).toBeVisible();

    const otherPage = await page.evaluate(async () => {
      const response = await fetch("/api/notifications");
      return {
        status: response.status,
        body: (await response.json()) as {
          data: { items: Array<{ id: string }>; unreadCount: number };
        },
      };
    });
    expect(otherPage.status).toBe(200);
    expect(otherPage.body.data.items.map((item) => item.id)).toContain(
      otherNotificationId,
    );
    expect(otherPage.body.data.items.map((item) => item.id)).not.toContain(
      ownerNotificationId,
    );
  });
});
