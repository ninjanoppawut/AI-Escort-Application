"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CameraOff,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { localStoreAvailable } from "@/lib/offline/local-store";
import { cn } from "@/lib/utils";

import { OBSERVATION_BLOCKED_REASON_LABELS } from "../../errors";
import {
  deleteMediaRequest,
  fetchMediaList,
  updateMediaCategoryRequest,
} from "../client/api";
import { getObservationUploadQueue } from "../client/browser-upload-queue";
import { buildMediaTiles, type MediaTile } from "../client/media-tiles";
import { keepFreshSignedUrls, withoutSignedUrl } from "../client/signed-urls";
import {
  uploadErrorCodeOf,
  type UploadQueue,
  type UploadStage,
} from "../client/upload-queue";
import {
  MAX_IMAGES_PER_OBSERVATION,
  mediaQueryKeys,
  type MediaCategory,
  type MediaListView,
} from "../contracts";
import { CaptureControls } from "./capture-controls";
import { DeleteMediaDialog } from "./delete-media-dialog";
import {
  MEDIA_COPY,
  announcementFor,
  uploadErrorPresentation,
} from "./media-copy";
import { MediaTileCard, MediaTilePanel } from "./media-tile";

/** Signed URLs last ten minutes; the list is considered fresh for eight. */
export const MEDIA_LIST_STALE_TIME_MS = 8 * 60_000;

const NETWORK_STAGES: ReadonlySet<UploadStage> = new Set([
  "queued",
  "registering",
  "uploading",
  "confirming",
  "failed_retryable",
]);

/** True when the browser reports the camera permission as denied. */
function useCameraPermissionDenied() {
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const update = () => {
      if (!cancelled && status) setDenied(status.state === "denied");
    };
    // Safari and Firefox reject the "camera" name; the gallery still works.
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        update();
        result.addEventListener("change", update);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener("change", update);
    };
  }, []);

  return denied;
}

/**
 * Evidence images on the owner's draft (P9-04, OBS-005 to OBS-008): capture
 * or pick up to ten images, see each one's processing, upload, retry, and
 * permission state, choose categories, and delete. The server list is the
 * authority; the in-memory queue shows what is still on this phone.
 */
export function ObservationMediaSection({
  observationId,
  queue: providedQueue,
}: {
  observationId: string;
  /** Injected in tests; the page uses the tab-wide queue for this draft. */
  queue?: UploadQueue;
}) {
  const queryClient = useQueryClient();
  const queue = useMemo(
    () => providedQueue ?? getObservationUploadQueue(observationId),
    [providedQueue, observationId],
  );
  const snapshot = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getServerSnapshot,
  );
  const listKey = useMemo(
    () => mediaQueryKeys.list(observationId),
    [observationId],
  );
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchMediaList(observationId),
    staleTime: MEDIA_LIST_STALE_TIME_MS,
    retry: false,
    structuralSharing: (previous, next) =>
      keepFreshSignedUrls(
        previous as MediaListView | undefined,
        next as MediaListView,
        Date.now(),
      ),
  });

  const titleId = useId();
  const cameraDenied = useCameraPermissionDenied();
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [choice, setChoice] = useState<{
    key: string;
    category: MediaCategory;
  } | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, number>>({});

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: listKey });
  }, [queryClient, listKey]);

  // Queue results refresh the authoritative list and are announced politely.
  useEffect(
    () =>
      queue.onEvent((event) => {
        const text = announcementFor(event);
        if (text) setAnnouncement(text);
        // A refusal may mean the list or the draft's state is stale.
        if (
          event.type === "uploaded" ||
          event.type === "blocked" ||
          event.type === "rejected" ||
          (event.type === "removed" && event.mediaId)
        ) {
          invalidateList();
        }
      }),
    [queue, invalidateList],
  );

  // Uploads may have finished while this page was away.
  useEffect(() => {
    if (queue.getSnapshot().items.length > 0) invalidateList();
  }, [queue, invalidateList]);

  // Once the server lists an image as uploaded, drop the local copy.
  const serverItems = listQuery.data?.items;
  useEffect(() => {
    if (!serverItems) return;
    const uploaded = new Set(
      serverItems
        .filter((item) => item.status === "uploaded")
        .map((item) => item.clientMediaId),
    );
    for (const item of snapshot.items) {
      if (item.stage === "uploaded" && uploaded.has(item.localId)) {
        queue.forget(item.localId);
      }
    }
  }, [serverItems, snapshot.items, queue]);

  // Unsent images are kept on the device (P14-01); only an image still being
  // processed, or a device without IndexedDB, would be lost by closing.
  const unsentAtRisk =
    snapshot.hasUnsent &&
    (!localStoreAvailable() ||
      snapshot.items.some((item) => item.stage === "processing"));
  useEffect(() => {
    if (!unsentAtRisk) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsentAtRisk]);

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => deleteMediaRequest(observationId, mediaId),
    onSuccess: (result, mediaId) => {
      // A just-uploaded image may still have its local copy in the queue.
      const local = queue
        .getSnapshot()
        .items.find((item) => item.mediaId === mediaId);
      if (local) queue.forget(local.localId);
      setAnnouncement(
        result.outcome === "deleted"
          ? MEDIA_COPY.announce.deleted
          : MEDIA_COPY.announce.deleting,
      );
    },
    onError: (error) =>
      setAnnouncement(uploadErrorPresentation(uploadErrorCodeOf(error)).title),
    onSettled: invalidateList,
  });

  const categoryMutation = useMutation({
    mutationFn: ({
      mediaId,
      category,
    }: {
      mediaId: string;
      category: MediaCategory;
    }) => updateMediaCategoryRequest(observationId, mediaId, category),
    onSuccess: (_result, { mediaId, category }) => {
      queryClient.setQueryData<MediaListView>(listKey, (list) =>
        list
          ? {
              ...list,
              items: list.items.map((item) =>
                item.id === mediaId ? { ...item, category } : item,
              ),
            }
          : list,
      );
      setChoice(null);
      setAnnouncement(MEDIA_COPY.announce.categoryUpdated(category));
    },
    onSettled: invalidateList,
  });

  const list = listQuery.data;
  const deletingId =
    deleteMutation.isPending && deleteMutation.variables
      ? deleteMutation.variables
      : null;
  const { tiles, used, uploadedWholePlantCount } = useMemo(
    () =>
      buildMediaTiles(
        list?.items ?? [],
        snapshot.items,
        new Set(deletingId ? [deletingId] : []),
      ),
    [list, snapshot.items, deletingId],
  );

  const maxImages = list?.limits.maxImages ?? MAX_IMAGES_PER_OBSERVATION;
  const remaining = Math.max(0, maxImages - used);
  const canEdit = list?.permissions.canEdit ?? false;
  const blockedReason =
    list && !list.permissions.canEdit
      ? (list.permissions.blockedReason &&
          OBSERVATION_BLOCKED_REASON_LABELS[list.permissions.blockedReason]) ||
        MEDIA_COPY.blockedFallback
      : null;

  let disabledReason: string | null = null;
  if (!list) {
    disabledReason = listQuery.isError
      ? MEDIA_COPY.listFailedReason
      : MEDIA_COPY.listLoadingReason;
  } else if (!canEdit) {
    disabledReason = `${MEDIA_COPY.blockedPrefix} · ${blockedReason}`;
  } else if (remaining === 0) {
    disabledReason = MEDIA_COPY.fullReason;
  }

  const hasWholePlant = uploadedWholePlantCount > 0;
  const selectedTile =
    tiles.find((tile) => tile.key === selectedKey) ??
    tiles.find((tile) => tile.state === "needs_category") ??
    null;
  const selectedChoice =
    choice && selectedTile && choice.key === selectedTile.key
      ? choice.category
      : null;
  const confirmTile =
    tiles.find((tile) => tile.key === confirmDeleteKey) ?? null;

  const networkActive = snapshot.items.some((item) =>
    NETWORK_STAGES.has(item.stage),
  );
  const failedCount = snapshot.items.filter(
    (item) => item.stage === "failed" || item.stage === "failed_retryable",
  ).length;
  const { done, total } = snapshot.batch;
  const progressText =
    networkActive && total > 0
      ? snapshot.online
        ? MEDIA_COPY.progress(Math.min(done + 1, total), total)
        : MEDIA_COPY.waitingProgress(Math.max(total - done, 1))
      : null;

  const handleFiles = (files: File[]) => {
    if (disabledReason) return;
    const accepted = files.slice(0, remaining);
    if (accepted.length === 0) return;
    // The first image of an empty draft is the whole plant by default;
    // any later image waits until the student chooses its category.
    const defaultCategory: MediaCategory | null =
      used === 0 ? "whole_plant" : null;
    queue.add(
      accepted.map((file, index) => ({
        file,
        category: index === 0 ? defaultCategory : null,
      })),
    );
    if (files.length > accepted.length) {
      const text = MEDIA_COPY.capped(files.length, accepted.length);
      setNotice(text);
      setAnnouncement(text);
    } else {
      setNotice(null);
    }
  };

  const activateTile = (tile: MediaTile) => {
    if (tile.state === "failed" && tile.local) {
      queue.retry(tile.local.localId);
      setSelectedKey(tile.key);
      return;
    }
    setSelectedKey((current) => (current === tile.key ? null : tile.key));
  };

  const handleImageError = (tile: MediaTile) => {
    const mediaId = tile.mediaId;
    if (!mediaId || tile.imageSource !== "signed") return;
    const count = (imageErrors[mediaId] ?? 0) + 1;
    setImageErrors((previous) => ({
      ...previous,
      [mediaId]: (previous[mediaId] ?? 0) + 1,
    }));
    // An expired or revoked URL: re-sign once, then show the placeholder.
    if (count === 1) {
      queryClient.setQueryData<MediaListView>(listKey, (current) =>
        withoutSignedUrl(current, mediaId),
      );
      void listQuery.refetch();
    }
  };

  const panelFor = (tile: MediaTile) => {
    const local = tile.local;
    const pendingCategory = selectedChoice ?? tile.category;
    const categoryErrorCode =
      categoryMutation.isError &&
      categoryMutation.variables?.mediaId === tile.mediaId
        ? uploadErrorCodeOf(categoryMutation.error)
        : null;
    return (
      <MediaTilePanel
        blockedReason={blockedReason}
        canEdit={canEdit}
        categoryError={
          categoryErrorCode
            ? uploadErrorPresentation(categoryErrorCode).title
            : null
        }
        choice={selectedChoice}
        deleteBusy={deleteMutation.isPending}
        isLastWholePlant={
          tile.state === "uploaded" &&
          tile.category === "whole_plant" &&
          uploadedWholePlantCount <= 1
        }
        onCancel={() => {
          if (local) queue.cancel(local.localId);
          setSelectedKey(null);
        }}
        onChoose={(category) => setChoice({ key: tile.key, category })}
        onClose={() => setSelectedKey(null)}
        onDelete={() => {
          if (!tile.mediaId) return;
          if (tile.state === "uploaded") {
            setConfirmDeleteKey(tile.key);
          } else {
            deleteMutation.mutate(tile.mediaId);
          }
        }}
        onDismiss={() => {
          if (local) queue.forget(local.localId);
          setSelectedKey(null);
        }}
        onRetry={() => {
          if (local) queue.retry(local.localId);
        }}
        onSaveCategory={() => {
          if (!pendingCategory) return;
          if (local && local.mediaId === null) {
            queue.setCategory(local.localId, pendingCategory);
            setChoice(null);
          } else if (tile.mediaId) {
            categoryMutation.mutate({
              mediaId: tile.mediaId,
              category: pendingCategory,
            });
          }
        }}
        onSend={() => {
          if (!local || !pendingCategory) return;
          queue.setCategory(local.localId, pendingCategory);
          setChoice(null);
          setSelectedKey(null);
        }}
        savingCategory={
          categoryMutation.isPending &&
          categoryMutation.variables?.mediaId === tile.mediaId
        }
        tile={tile}
      />
    );
  };

  const listErrorCode = listQuery.isError
    ? uploadErrorCodeOf(listQuery.error)
    : null;

  return (
    <section
      aria-labelledby={titleId}
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-media-section=""
    >
      <div className="grid gap-2">
        <h2 className="text-lg font-semibold" id={titleId}>
          {`${MEDIA_COPY.title} · ${MEDIA_COPY.count(used, maxImages)}`}
        </h2>
        <p
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[13px] leading-5 font-semibold",
            hasWholePlant
              ? "text-success border-[#A8CDB6] bg-[#E7F0EA]"
              : "border-dashed border-[#6B4204] bg-[#FFF6E5] text-[#5C3A04]",
          )}
          data-whole-plant={hasWholePlant ? "present" : "missing"}
        >
          {hasWholePlant ? (
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          )}
          {hasWholePlant
            ? MEDIA_COPY.wholePlantPresent
            : MEDIA_COPY.wholePlantMissing}
        </p>
      </div>

      {!snapshot.online ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
          data-media-offline=""
          role="status"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{MEDIA_COPY.offlineTitle}</p>
            <p className="mt-0.5 leading-6">{MEDIA_COPY.offlineBody}</p>
          </div>
        </div>
      ) : null}

      {progressText || failedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {progressText ? (
            <p
              className="flex items-center gap-2 text-sm font-medium"
              data-media-progress=""
            >
              <CloudUpload aria-hidden="true" className="size-4 shrink-0" />
              {progressText}
            </p>
          ) : (
            <span />
          )}
          {failedCount > 0 ? (
            <Button onClick={() => queue.retryAll()} variant="outline">
              <RotateCcw aria-hidden="true" className="size-4" />
              {MEDIA_COPY.retryAll}
            </Button>
          ) : null}
        </div>
      ) : null}

      {snapshot.hasUnsent ? (
        <p
          className="flex items-start gap-2 text-[13px] leading-5 text-[#5C3A04]"
          data-unsent-warning=""
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {MEDIA_COPY.unsentWarning}
        </p>
      ) : null}

      {listQuery.isError ? (
        <div
          className="border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
          data-media-list-error={listErrorCode ?? "NETWORK"}
          role="status"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {listErrorCode && listErrorCode !== "NETWORK"
                ? uploadErrorPresentation(listErrorCode).title
                : MEDIA_COPY.listFailedTitle}
            </p>
            <p className="text-muted-foreground mt-0.5 leading-6">
              {MEDIA_COPY.listFailedHint}
            </p>
          </div>
          <Button
            disabled={listQuery.isFetching}
            onClick={() => void listQuery.refetch()}
            variant="outline"
          >
            {listQuery.isFetching ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            {MEDIA_COPY.reloadList}
          </Button>
        </div>
      ) : null}

      {tiles.length > 0 ? (
        <ul
          aria-label={MEDIA_COPY.title}
          className="grid grid-cols-3 gap-2"
          data-media-grid=""
        >
          {tiles.map((tile) => (
            <MediaTileCard
              imageFailed={
                tile.mediaId !== null && (imageErrors[tile.mediaId] ?? 0) >= 2
              }
              key={tile.key}
              onActivate={() => activateTile(tile)}
              onImageError={() => handleImageError(tile)}
              selected={selectedTile?.key === tile.key}
              tile={tile}
            />
          ))}
        </ul>
      ) : list ? (
        <div
          className="border-border text-muted-foreground grid justify-items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center text-sm"
          data-media-empty=""
        >
          <Camera aria-hidden="true" className="size-7" />
          <p className="text-foreground font-semibold">
            {MEDIA_COPY.emptyTitle}
          </p>
          <p className="leading-6">{MEDIA_COPY.emptyHint}</p>
        </div>
      ) : listQuery.isPending ? (
        <div className="grid grid-cols-3 gap-2" role="status">
          <span className="sr-only">{MEDIA_COPY.listLoadingReason}</span>
          {[0, 1, 2].map((index) => (
            <span
              className="bg-muted aspect-square animate-pulse rounded-lg motion-reduce:animate-none"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {selectedTile ? panelFor(selectedTile) : null}

      {notice ? (
        <p
          className="flex items-start gap-2 text-sm leading-6"
          data-media-notice=""
        >
          <Info aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {notice}
        </p>
      ) : null}

      {cameraDenied ? (
        <div
          className="rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-[#5C3A04]"
          data-camera-permission="denied"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CameraOff aria-hidden="true" className="size-5 shrink-0" />
            {MEDIA_COPY.cameraDenied.title}
          </p>
          <p className="mt-1 text-sm leading-6">
            {MEDIA_COPY.cameraDenied.description}
          </p>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm leading-6">
            {MEDIA_COPY.cameraDenied.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <CaptureControls
        disabledReason={disabledReason}
        maxFiles={remaining}
        onFiles={handleFiles}
      />

      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-media-announcer=""
      >
        {announcement}
      </div>

      {confirmTile && confirmTile.mediaId ? (
        <DeleteMediaDialog
          busy={deleteMutation.isPending}
          category={confirmTile.category}
          index={confirmTile.index}
          onCancel={() => setConfirmDeleteKey(null)}
          onConfirm={() => {
            deleteMutation.mutate(confirmTile.mediaId!);
            setConfirmDeleteKey(null);
            setSelectedKey(null);
          }}
        />
      ) : null}
    </section>
  );
}
