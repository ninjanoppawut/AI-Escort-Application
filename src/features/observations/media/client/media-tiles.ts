import type { MediaCategory, MediaItemView } from "../contracts";
import type { UploadErrorCode, UploadItem, UploadStage } from "./upload-queue";

export type MediaTileState =
  | "processing"
  | "needs_category"
  | "waiting"
  | "uploading"
  | "uploaded"
  | "failed"
  | "blocked"
  | "rejected"
  | "deleting"
  | "cancelling"
  /** A reserved row whose local bytes are gone (e.g. after a reload). */
  | "retake";

export interface MediaTile {
  key: string;
  /** 1-based display order. */
  index: number;
  state: MediaTileState;
  category: MediaCategory | null;
  /** Upload progress, 0..1. */
  progress: number;
  imageUrl: string | null;
  imageSource: "signed" | "preview" | null;
  local: UploadItem | null;
  server: MediaItemView | null;
  mediaId: string | null;
  errorCode: UploadErrorCode | null;
  /** A failed image the queue will retry by itself. */
  autoRetry: boolean;
  waitingForNetwork: boolean;
}

export interface MediaTileSummary {
  tiles: MediaTile[];
  /** Slots taken or about to be taken, out of the ten allowed. */
  used: number;
  /** Uploaded whole-plant images (the submission requirement). */
  uploadedWholePlantCount: number;
}

const LOCAL_STATE: Record<UploadStage, MediaTileState> = {
  processing: "processing",
  needs_category: "needs_category",
  queued: "waiting",
  registering: "uploading",
  uploading: "uploading",
  confirming: "uploading",
  uploaded: "uploaded",
  failed_retryable: "failed",
  failed: "failed",
  blocked: "blocked",
  rejected: "rejected",
  cancelling: "cancelling",
};

/** Local images that hold (or are about to hold) one of the ten slots. */
const SLOT_STAGES: ReadonlySet<UploadStage> = new Set([
  "processing",
  "needs_category",
  "queued",
  "registering",
  "uploading",
  "confirming",
  "failed_retryable",
  "failed",
  "uploaded",
]);

function localProgress(item: UploadItem) {
  if (item.stage === "registering") return 0;
  if (item.stage === "confirming" || item.stage === "uploaded") return 1;
  return item.progress;
}

function fromLocal(
  item: UploadItem,
  server: MediaItemView | null,
  deleting: boolean,
): Omit<MediaTile, "index"> {
  const uploaded = item.stage === "uploaded";
  const signedUrl = server?.status === "uploaded" ? server.signedUrl : null;
  const imageUrl = (uploaded && signedUrl) || item.previewUrl;
  return {
    key: item.localId,
    state:
      deleting || server?.status === "deleting"
        ? "deleting"
        : LOCAL_STATE[item.stage],
    category: server?.category ?? item.category,
    progress: localProgress(item),
    imageUrl,
    imageSource: !imageUrl
      ? null
      : imageUrl === item.previewUrl
        ? "preview"
        : "signed",
    local: item,
    server,
    mediaId: server?.id ?? item.mediaId,
    errorCode: item.errorCode,
    autoRetry: item.stage === "failed_retryable",
    waitingForNetwork: item.waitingForNetwork,
  };
}

function fromServer(
  server: MediaItemView,
  deleting: boolean,
): Omit<MediaTile, "index"> {
  const state: MediaTileState =
    deleting || server.status === "deleting"
      ? "deleting"
      : server.status === "uploaded"
        ? "uploaded"
        : "retake";
  return {
    key: server.clientMediaId,
    state,
    category: server.category,
    progress: server.status === "uploaded" ? 1 : 0,
    imageUrl: server.status === "uploaded" ? server.signedUrl : null,
    imageSource:
      server.status === "uploaded" && server.signedUrl ? "signed" : null,
    local: null,
    server,
    mediaId: server.id,
    errorCode: null,
    autoRetry: false,
    waitingForNetwork: false,
  };
}

/**
 * Merges the authoritative server list with the in-memory queue. Server rows
 * keep their position order; local images that have no row yet follow in the
 * order they were taken. Matching uses the client media ID.
 */
export function buildMediaTiles(
  serverItems: readonly MediaItemView[],
  localItems: readonly UploadItem[],
  deletingIds: ReadonlySet<string> = new Set(),
): MediaTileSummary {
  const localById = new Map(localItems.map((item) => [item.localId, item]));
  const matched = new Set<string>();
  const drafts: Omit<MediaTile, "index">[] = [];
  let used = 0;

  for (const server of serverItems) {
    const local = localById.get(server.clientMediaId) ?? null;
    const deleting = deletingIds.has(server.id);
    if (server.status !== "deleting") used += 1;
    if (local) {
      matched.add(local.localId);
      drafts.push(fromLocal(local, server, deleting));
    } else {
      drafts.push(fromServer(server, deleting));
    }
  }

  for (const local of localItems) {
    if (matched.has(local.localId)) continue;
    if (SLOT_STAGES.has(local.stage)) used += 1;
    drafts.push(
      fromLocal(
        local,
        null,
        Boolean(local.mediaId && deletingIds.has(local.mediaId)),
      ),
    );
  }

  const tiles = drafts.map((tile, index) => ({ ...tile, index: index + 1 }));
  return {
    tiles,
    used,
    uploadedWholePlantCount: tiles.filter(
      (tile) => tile.state === "uploaded" && tile.category === "whole_plant",
    ).length,
  };
}
