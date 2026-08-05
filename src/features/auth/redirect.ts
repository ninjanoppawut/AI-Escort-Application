const APP_FALLBACK = "/app";

function isAllowedPath(pathname: string) {
  if (pathname === APP_FALLBACK || pathname.startsWith(`${APP_FALLBACK}/`)) {
    return true;
  }

  if (pathname.startsWith("/join/")) {
    const token = pathname.slice("/join/".length);
    return /^[A-Za-z0-9_-]{8,256}$/.test(token);
  }

  return false;
}

export function safeReturnPath(
  value: string | null | undefined,
  fallback = APP_FALLBACK,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes(String.fromCharCode(92)) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://redirect.invalid");
    const candidate = new URL(value, base);

    if (
      candidate.origin !== base.origin ||
      !isAllowedPath(candidate.pathname)
    ) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return fallback;
  }
}

export function authCallbackUrl(
  origin: string,
  returnTo: string | null | undefined,
  flow: "signup" | "recovery",
) {
  const callback = new URL("/api/auth/callback", origin);
  callback.searchParams.set("next", safeReturnPath(returnTo));
  callback.searchParams.set("flow", flow);
  return callback.toString();
}
