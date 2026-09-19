import { expect, test, type BrowserContext } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  queryLocalSql,
  sqlLiteral,
} from "./support/local-supabase";
import {
  EVIDENCE,
  addWholePlantImage,
  openFieldShell,
  setupField,
} from "./support/observation-journey";

// P14-01/P14-02 against the local stack at 390 px, in airplane mode: a
// student starts an observation offline, closes the page, and the start is
// sent once when a new page opens online. The student then submits offline;
// the submit waits on the device and is sent once on reconnect.

test.describe("P14 offline field sync", () => {
  // next dev compiles each new route on first use.
  test.setTimeout(900_000);

  test("offline start and submit are kept on the device and sent once on reconnect", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P14 offline journey runs once, at 390 px, against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const { adaEmail, password, activityId, sessionId } = await setupField(
      request,
      "offline",
    );
    const shellUrl = `/activities/${activityId}/sessions/${sessionId}`;
    const countSql = `select count(*) from public.observations
      where session_id = ${sqlLiteral(sessionId)}::uuid
        and observer_id = (select id from public.profiles where email = ${sqlLiteral(adaEmail)});`;

    const contexts: BrowserContext[] = [];
    try {
      const { context, page } = await openFieldShell(
        browser,
        baseURL,
        adaEmail,
        password,
        shellUrl,
      );
      contexts.push(context);
      await context.setGeolocation({
        latitude: 13.7551,
        longitude: 100.5051,
        accuracy: 7.6,
      });

      // 1. Airplane mode: the start is kept on the device.
      await context.setOffline(true);
      const start = page.getByRole("button", { name: "เพิ่มการสังเกต" });
      await expect(start).toBeEnabled({ timeout: 30_000 });
      await start.click();
      const sheet = page.getByRole("dialog", { name: "เพิ่มการสังเกต" });
      await expect(sheet).toBeVisible();
      await context.setGeolocation({
        latitude: 13.7552,
        longitude: 100.5052,
        accuracy: 7.6,
      });
      await expect(sheet).toContainText("±8 ม.", { timeout: 30_000 });
      await sheet
        .getByRole("button", { name: "ใช้ตำแหน่งนี้ · เก็บไว้ในเครื่อง" })
        .click();
      const queued = page.getByRole("region", { name: "รอส่งจากเครื่องนี้" });
      await expect(queued).toBeVisible();
      await expect(queued.locator("[data-queued-status]")).toHaveAttribute(
        "data-queued-status",
        "pending",
      );
      await expect(queued).toContainText("จะส่งเองเมื่อกลับมาออนไลน์");
      await expectNoHorizontalOverflow(page);
      expect(await queryLocalSql(countSql)).toBe("0");

      // 2. The page closes while offline; a new page opens online and sends
      //    the kept start exactly once.
      await page.close();
      await context.setOffline(false);
      const next = await context.newPage();
      await next.goto(shellUrl);
      await expect
        .poll(() => queryLocalSql(countSql), { timeout: 120_000 })
        .toBe("1");
      await expect(
        next.getByRole("region", { name: "รอส่งจากเครื่องนี้" }),
      ).toHaveCount(0, { timeout: 60_000 });
      // A later reconnect has nothing left to resend.
      await context.setOffline(true);
      await context.setOffline(false);
      await next.waitForTimeout(2_000);
      expect(await queryLocalSql(countSql)).toBe("1");

      const observationId = await queryLocalSql(
        `select id from public.observations
          where session_id = ${sqlLiteral(sessionId)}::uuid
            and observer_id = (select id from public.profiles where email = ${sqlLiteral(adaEmail)});`,
      );

      // 3. Prepare the draft online: a whole-plant image and saved names.
      await next.goto(`/observations/${observationId}`);
      await addWholePlantImage(next);
      const draft = (await (
        await context.request.get(`/api/observations/${observationId}`)
      ).json()) as { data: { version: number } };
      const saved = await context.request.put(
        `/api/observations/${observationId}/student-review`,
        {
          data: {
            expectedVersion: draft.data.version,
            identitySource: "manual",
            commonName: "ชบา",
            scientificName: "Hibiscus rosa-sinensis",
            evidenceNote: EVIDENCE,
            referenceNote: null,
            traits: [],
          },
        },
      );
      expect(saved.status(), await saved.text()).toBe(200);
      await next.reload();

      // 4. Airplane mode again: the submit waits on the device.
      const panel = next.getByRole("region", { name: "สรุปก่อนส่ง" });
      await expect(panel).toBeVisible({ timeout: 120_000 });
      await context.setOffline(true);
      await panel
        .getByRole("button", { name: "ส่งการสังเกต · เก็บไว้ในเครื่อง" })
        .click();
      await next.getByRole("button", { name: "ยืนยันส่งให้ครู" }).click();
      await expect(
        panel.getByRole("region", { name: "รอส่งจากเครื่องนี้" }),
      ).toBeVisible();
      await expect(panel.locator("[data-submit-gate]")).toContainText(
        "การส่งนี้รออยู่ในเครื่อง",
      );
      const submissionSql = `select observation.status || '|' || count(submission.id)
        from public.observations as observation
        left join public.observation_submissions as submission
          on submission.observation_id = observation.id
        where observation.id = ${sqlLiteral(observationId)}::uuid
        group by observation.status;`;
      expect(await queryLocalSql(submissionSql)).toBe("student_review|0");

      // 5. Reconnect: sent once, and the frozen submission is shown.
      await context.setOffline(false);
      await expect
        .poll(() => queryLocalSql(submissionSql), { timeout: 120_000 })
        .toBe("submitted|1");
      await expect(
        next.getByRole("region", { name: "รอส่งจากเครื่องนี้" }),
      ).toHaveCount(0, { timeout: 60_000 });
      await expectNoHorizontalOverflow(next);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
