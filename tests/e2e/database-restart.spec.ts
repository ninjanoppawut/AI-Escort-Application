import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  createConfirmedUser,
  getLocalSupabaseEnv,
  runLocalSql,
  sqlLiteral,
} from "./support/local-supabase";

// P2-EXIT restarts the local database container, so it runs in its own
// Playwright project after every other browser project has finished.

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

test.describe("P2-EXIT notification durability", () => {
  test.setTimeout(240_000);

  test("notifications survive a local database restart and remain recipient-scoped", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "database-restart",
      "P2-EXIT restart journey runs once against the local Supabase stack.",
    );
    await page.context().setOffline(false);

    const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const ownerEmail = `notify-restart-owner-${suffix}@example.edu`;
    const otherEmail = `notify-restart-other-${suffix}@example.edu`;
    const password = "notification passphrase 1";
    const localEnv = getLocalSupabaseEnv();

    for (const email of [ownerEmail, otherEmail]) {
      await createConfirmedUser(request, localEnv, email, password);
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

    // Auth settings do not touch PostgreSQL, so wait for a real password grant
    // and an authenticated PostgREST read before driving the browser.
    await expect
      .poll(
        async () => {
          const token = await request
            .post(`${localEnv.API_URL}/auth/v1/token?grant_type=password`, {
              headers: { apikey: localEnv.PUBLISHABLE_KEY! },
              data: { email: ownerEmail, password },
              failOnStatusCode: false,
            })
            .catch(() => null);
          if (!token?.ok()) return false;
          const { access_token: accessToken } = (await token.json()) as {
            access_token: string;
          };
          const rest = await request
            .get(
              `${localEnv.API_URL}/rest/v1/notifications?select=id&limit=1`,
              {
                headers: {
                  apikey: localEnv.PUBLISHABLE_KEY!,
                  authorization: `Bearer ${accessToken}`,
                },
                failOnStatusCode: false,
              },
            )
            .catch(() => null);
          return rest?.ok() ?? false;
        },
        { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
      )
      .toBe(true);

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
