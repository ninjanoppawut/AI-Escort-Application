import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { queryLocalSql } from "./support/local-supabase";
import {
  addWholePlantImage,
  openFieldShell,
  setupField,
  signInContext,
  startObservation,
  studentContext,
  submitViaApi,
  teacherContext,
} from "./support/observation-journey";

// P14-03/P14-04 against the local stack: the teacher exports the completed
// session from the map; the small CSV is ready in the request, notifies once,
// and downloads through a reauthorized one-minute link with the export-v1
// header, the capture coordinates, and no email; a replayed key returns the
// same export, a reused key with another body is refused, a GeoJSON export
// carries a Point, and a student cannot read or download the export.

test.describe("P14 exports", () => {
  test.setTimeout(900_000);
  test.use({ actionTimeout: 60_000 });

  test("teacher CSV and GeoJSON exports with idempotency and reauthorized download", async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "student-mobile-chromium",
      "P14 export journey runs once against the local Supabase stack.",
    );

    const baseURL = String(
      testInfo.project.use.baseURL ?? "http://localhost:3000",
    );
    const field = await setupField(request, "export");
    const shellUrl = `/activities/${field.activityId}/sessions/${field.sessionId}`;
    const contexts: BrowserContext[] = [];

    try {
      const { context: adaContext, page: ada } = await openFieldShell(
        browser,
        baseURL,
        field.adaEmail,
        field.password,
        shellUrl,
      );
      contexts.push(adaContext);
      const observationId = await startObservation(ada, adaContext);
      await addWholePlantImage(ada);
      await submitViaApi(adaContext, observationId, {
        commonName: "ชบา",
        scientificName: "Hibiscus rosa-sinensis",
      });

      const tamContext = await teacherContext(browser, baseURL);
      contexts.push(tamContext);
      await signInContext(tamContext, field.teacherEmail, field.password);
      const completed = await tamContext.request.post(
        `/api/sessions/${field.sessionId}/complete`,
        { data: {} },
      );
      expect(completed.status(), await completed.text()).toBe(200);

      // 1. Export CSV from the completed map.
      const tam = await tamContext.newPage();
      await tam.goto(`/sessions/${field.sessionId}/map`);
      await tam
        .getByRole("button", { name: "ส่งออก" })
        .click({ timeout: 120_000 });
      const dialog = tam.getByRole("dialog", { name: "ส่งออกผลการสำรวจ" });
      await expect(dialog).toContainText("ยังมี 1 รายการรอตรวจ");
      await dialog.getByRole("button", { name: "สร้างไฟล์ส่งออก" }).click();
      await tam.waitForURL(/\/teacher\/exports\/[0-9a-f-]{36}$/, {
        timeout: 120_000,
      });
      const exportId = new URL(tam.url()).pathname.split("/").at(-1)!;
      await expect(tam.locator("[data-export-status]")).toHaveAttribute(
        "data-export-status",
        "ready",
        { timeout: 120_000 },
      );
      expect(
        queryLocalSql(
          `select count(*) from public.notifications where type = 'export_ready' and export_id = '${exportId}'::uuid;`,
        ),
      ).toBe("1");

      // 2. Download through the reauthorized one-minute link.
      const redirect = await tamContext.request.get(
        `/api/exports/${exportId}/download`,
        { maxRedirects: 0 },
      );
      expect(redirect.status()).toBe(303);
      const location = redirect.headers()["location"]!;
      expect(location).toContain("/storage/v1/object/sign/activity-exports/");
      const file = await tamContext.request.get(location);
      expect(file.status()).toBe(200);
      const csv = (await file.body()).toString("utf8");
      const [header, line] = csv
        .slice(csv.charCodeAt(0) === 0xfeff ? 1 : 0)
        .split("\r\n");
      expect(header!.split(",").slice(0, 3)).toEqual([
        "schema_version",
        "observation_id",
        "status",
      ]);
      expect(line).toContain(observationId);
      expect(line).toContain("ชบา");
      expect(line).toContain("13.7551");
      expect(csv).not.toContain("@example.edu");

      // 3. Idempotency: a replay is the same export; another body is refused.
      const key = randomUUID();
      const body = {
        classId: field.classId,
        sessionId: field.sessionId,
        type: "geojson",
        filters: {},
      };
      const first = await tamContext.request.post("/api/exports", {
        data: body,
        headers: { "idempotency-key": key },
      });
      expect(first.status(), await first.text()).toBe(201);
      const firstBody = (await first.json()) as {
        data: { exportId: string; status: string };
      };
      const replay = await tamContext.request.post("/api/exports", {
        data: body,
        headers: { "idempotency-key": key },
      });
      expect(
        ((await replay.json()) as { data: { exportId: string } }).data.exportId,
      ).toBe(firstBody.data.exportId);
      const reused = await tamContext.request.post("/api/exports", {
        data: { ...body, type: "csv" },
        headers: { "idempotency-key": key },
      });
      expect(reused.status()).toBe(409);
      const noKey = await tamContext.request.post("/api/exports", {
        data: body,
      });
      expect(noKey.status()).toBe(422);

      const geoRedirect = await tamContext.request.get(
        `/api/exports/${firstBody.data.exportId}/download`,
        { maxRedirects: 0 },
      );
      const geo = (await (
        await tamContext.request.get(geoRedirect.headers()["location"]!)
      ).json()) as { features: Array<{ geometry: { type: string } | null }> };
      expect(geo.features[0]!.geometry?.type).toBe("Point");

      // 4. A student can neither read nor download the export.
      const cyContext = await studentContext(browser, baseURL);
      contexts.push(cyContext);
      await signInContext(cyContext, field.cyEmail, field.password);
      expect([403, 404]).toContain(
        (await cyContext.request.get(`/api/exports/${exportId}`)).status(),
      );
      const denied = await cyContext.request.get(
        `/api/exports/${exportId}/download`,
        { maxRedirects: 0 },
      );
      expect([403, 404]).toContain(denied.status());
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
