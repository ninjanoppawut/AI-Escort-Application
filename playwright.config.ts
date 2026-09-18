import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const configuredPort = new URL(baseURL).port || "3000";
const devPort = /^\d{2,5}$/.test(configuredPort) ? configuredPort : "3000";

// P2-EXIT restarts the local database; it runs alone after the CI projects.
const databaseRestartSpec = /database-restart\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: databaseRestartSpec,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    // CI serves the production build it made after exporting the local
    // Supabase configuration; next dev compiles each route on first use and
    // made multi-route journeys time out on shared runners.
    command: process.env.CI
      ? `node node_modules/next/dist/bin/next start --port ${devPort}`
      : `node node_modules/next/dist/bin/next dev --port ${devPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    {
      name: "student-mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "student-mobile-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "student-small",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "teacher-desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "teacher-tablet-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "database-restart",
      testIgnore: [],
      testMatch: databaseRestartSpec,
      dependencies: ["student-mobile-chromium", "teacher-desktop-chromium"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "admin-desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
