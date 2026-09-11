import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";

export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function localDatabaseContainer() {
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
  return container;
}

function psql(sql: string, extraArgs: string[] = []) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      localDatabaseContainer(),
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--quiet",
      ...extraArgs,
    ],
    { input: sql, encoding: "utf8" },
  );
}

export function runLocalSql(sql: string) {
  psql(sql);
}

/** Returns unaligned, tuples-only output for read-only verification queries. */
export function queryLocalSql(sql: string) {
  return psql(sql, ["--tuples-only", "--no-align"]).trim();
}

export function getLocalSupabaseEnv() {
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
  ) as Record<string, string>;
}

export async function createConfirmedUser(
  request: APIRequestContext,
  env: Record<string, string>,
  email: string,
  password: string,
) {
  const response = await request.post(`${env.API_URL}/auth/v1/admin/users`, {
    headers: {
      apikey: env.SERVICE_ROLE_KEY!,
      authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    },
    data: { email, password, email_confirm: true, user_metadata: {} },
  });
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(
    true,
  );
}

export async function signIn(page: Page, email: string, password: string) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
