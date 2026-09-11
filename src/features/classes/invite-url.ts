export function buildJoinUrl(origin: string, token: string) {
  return `${origin}/join/${encodeURIComponent(token)}`;
}
