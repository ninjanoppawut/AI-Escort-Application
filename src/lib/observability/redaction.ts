const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

const prohibitedKey =
  /(^|_)(access|refresh)?_?token$|authorization|cookie|password|secret|signed_?url|private_?image|evidence|latitude|longitude|coordinates|live_?location/i;

const jwtLike = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const sensitiveQuery =
  /([?&](?:token|signature|x-amz-signature|x-amz-credential)=)[^&\s]+/gi;

function redactString(value: string) {
  return value
    .replace(jwtLike, REDACTED)
    .replace(sensitiveQuery, `$1${REDACTED}`);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[TRUNCATED]";
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        prohibitedKey.test(key)
          ? REDACTED
          : redactValue(nestedValue, depth + 1),
      ]),
    );
  }

  return value;
}

export function redactTelemetry(value: unknown): unknown {
  return redactValue(value, 0);
}

export function isRedacted(value: unknown): value is typeof REDACTED {
  return value === REDACTED;
}
