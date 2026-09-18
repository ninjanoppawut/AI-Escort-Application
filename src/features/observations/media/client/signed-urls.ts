import { replaceEqualDeep } from "@tanstack/react-query";

import type { MediaListView } from "../contracts";

/** A signed URL is reused until this long before it expires. */
export const SIGNED_URL_REUSE_MARGIN_MS = 60_000;

/**
 * Structural sharing for the media list: every refetch signs fresh URLs, which
 * would make each `<img>` download again. Keep an image's earlier URL while it
 * stays valid for more than a minute. An item whose new URL is null (not yet
 * uploaded, or dropped after a load error) never inherits the old one.
 */
export function keepFreshSignedUrls(
  previous: MediaListView | undefined,
  next: MediaListView,
  now: number,
): MediaListView {
  if (!previous) return next;
  const earlier = new Map(previous.items.map((item) => [item.id, item]));
  const merged: MediaListView = {
    ...next,
    items: next.items.map((item) => {
      const prior = earlier.get(item.id);
      if (!item.signedUrl || !prior?.signedUrl || !prior.expiresAt) return item;
      const expiresAt = Date.parse(prior.expiresAt);
      if (
        !Number.isFinite(expiresAt) ||
        expiresAt - SIGNED_URL_REUSE_MARGIN_MS <= now
      ) {
        return item;
      }
      return {
        ...item,
        signedUrl: prior.signedUrl,
        expiresAt: prior.expiresAt,
      };
    }),
  };
  return replaceEqualDeep(previous, merged);
}

/** Drops one image's signed URL so the next refetch signs a new one. */
export function withoutSignedUrl(
  list: MediaListView | undefined,
  mediaId: string,
): MediaListView | undefined {
  if (!list) return list;
  return {
    ...list,
    items: list.items.map((item) =>
      item.id === mediaId
        ? { ...item, signedUrl: null, expiresAt: null }
        : item,
    ),
  };
}
