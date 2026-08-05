import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const supabaseUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith("https://") ||
      value.startsWith("http://127.0.0.1:") ||
      value.startsWith("http://localhost:"),
    "Supabase URL must use HTTPS unless it targets local development.",
  );

const publishableKeySchema = z
  .string()
  .min(24)
  .refine(
    (value) => value.startsWith("sb_publishable_"),
    "Use a current Supabase publishable key.",
  );

export const appEnvironmentSchema = z.enum([
  "local",
  "preview",
  "staging",
  "production",
]);

export const browserEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKeySchema,
  NEXT_PUBLIC_APP_ENV: appEnvironmentSchema,
  NEXT_PUBLIC_MAPBOX_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional(),
  ),
});

export const serverEnvironmentSchema = browserEnvironmentSchema
  .extend({
    SUPABASE_SECRET_KEY: optionalSecret,
    GEMINI_API_KEY: optionalSecret,
    SMTP_HOST: optionalSecret,
    SMTP_PORT: z.preprocess(
      emptyStringToUndefined,
      z.coerce.number().int().min(1).max(65_535).optional(),
    ),
    SMTP_USER: optionalSecret,
    SMTP_PASSWORD: optionalSecret,
    SMTP_FROM: z.preprocess(emptyStringToUndefined, z.email().optional()),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
      emptyStringToUndefined,
      z.url().optional(),
    ),
    RELEASE_SHA: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1).default("development"),
    ),
  })
  .superRefine((environment, context) => {
    const smtpFields = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_FROM",
    ] as const;
    const smtpConfigured = smtpFields.some(
      (field) => environment[field] !== undefined,
    );
    const smtpRequired =
      smtpConfigured || environment.NEXT_PUBLIC_APP_ENV === "production";

    if (!smtpRequired) {
      return;
    }

    for (const field of smtpFields) {
      if (environment[field] === undefined) {
        context.addIssue({
          code: "custom",
          message: "A complete custom SMTP configuration is required.",
          path: [field],
        });
      }
    }
  });

export type BrowserEnvironment = z.infer<typeof browserEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(
      "Environment configuration is invalid. Check the named fields; values are intentionally omitted.",
    );
    this.name = "EnvironmentConfigurationError";
    this.fields = fields;
  }
}

function invalidFields(error: z.ZodError) {
  return [
    ...new Set(
      error.issues.map((issue) => issue.path.join(".") || "environment"),
    ),
  ].sort();
}

export function parseBrowserEnvironment(
  input: Record<string, unknown>,
): BrowserEnvironment {
  const result = browserEnvironmentSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentConfigurationError(invalidFields(result.error));
  }

  return result.data;
}

export function parseServerEnvironment(
  input: Record<string, unknown>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentConfigurationError(invalidFields(result.error));
  }

  return result.data;
}
