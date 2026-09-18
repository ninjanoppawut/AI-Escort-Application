"use client";

import {
  Ban,
  Camera,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudUpload,
  ImageOff,
  Loader2,
  Lock,
  RotateCcw,
  Tag,
  Trash2,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MEDIA_CATEGORY_LABELS, type MediaCategory } from "../contracts";
import type { MediaTile, MediaTileState } from "../client/media-tiles";
import { ImageCategoryPicker } from "./image-category-picker";
import { MEDIA_COPY, uploadErrorPresentation } from "./media-copy";

function percentOf(tile: MediaTile) {
  return Math.round(Math.min(Math.max(tile.progress, 0), 1) * 100);
}

/** Short visible status text for a tile; the icon and shape repeat it. */
export function tileStatusText(tile: MediaTile): string {
  switch (tile.state) {
    case "processing":
      return MEDIA_COPY.tile.processing;
    case "needs_category":
      return MEDIA_COPY.tile.needsCategory;
    case "waiting":
      return MEDIA_COPY.tile.waiting;
    case "uploading":
      return MEDIA_COPY.tile.uploading(percentOf(tile));
    case "uploaded":
      return MEDIA_COPY.tile.uploaded;
    case "failed":
      return MEDIA_COPY.tile.failed;
    case "blocked":
      return MEDIA_COPY.tile.blocked;
    case "rejected":
      return MEDIA_COPY.tile.rejected;
    case "deleting":
      return MEDIA_COPY.tile.deleting;
    case "cancelling":
      return MEDIA_COPY.tile.cancelling;
    case "retake":
      return MEDIA_COPY.tile.retake;
  }
}

const STATE_ICON: Record<MediaTileState, LucideIcon> = {
  processing: Loader2,
  needs_category: Tag,
  waiting: Clock,
  uploading: CloudUpload,
  uploaded: CircleCheck,
  failed: CircleAlert,
  blocked: Lock,
  rejected: Ban,
  deleting: Trash2,
  cancelling: Loader2,
  retake: Camera,
};

const STRIP_CLASS: Record<MediaTileState, string> = {
  processing: "bg-[rgba(22,33,28,.8)] text-white",
  needs_category: "bg-[#FFF6E5] text-[#5C3A04]",
  waiting: "bg-[rgba(22,33,28,.8)] text-white",
  uploading: "bg-[rgba(22,33,28,.8)] text-white",
  uploaded: "bg-[#14472F] text-white",
  failed: "bg-[#B3261E] text-white",
  blocked: "bg-[#55605A] text-white",
  rejected: "bg-[#55605A] text-white",
  deleting: "bg-[rgba(22,33,28,.8)] text-white",
  cancelling: "bg-[rgba(22,33,28,.8)] text-white",
  retake: "bg-[#FFF6E5] text-[#5C3A04]",
};

const BORDER_CLASS: Partial<Record<MediaTileState, string>> = {
  failed: "border-2 border-[#B3261E]",
  needs_category: "border-2 border-dashed border-[#6B4204]",
  retake: "border-2 border-dashed border-[#6B4204]",
  rejected: "border-2 border-dashed border-[#55605A]",
  blocked: "border-2 border-dashed border-[#55605A]",
};

/**
 * One square image tile. The whole tile is a button: a failed tile retries
 * on tap ("แตะเพื่อลองใหม่"); every other tile opens its detail panel. State
 * is carried by text, icon, and border shape, never by colour alone.
 */
export function MediaTileCard({
  tile,
  selected,
  imageFailed,
  onActivate,
  onImageError,
}: {
  tile: MediaTile;
  selected: boolean;
  imageFailed: boolean;
  onActivate: () => void;
  onImageError: () => void;
}) {
  const alt = MEDIA_COPY.imageAlt(tile.index, tile.category);
  const status = tileStatusText(tile);
  const Icon =
    tile.state === "waiting" && tile.waitingForNetwork
      ? WifiOff
      : STATE_ICON[tile.state];
  const spinning = tile.state === "processing" || tile.state === "cancelling";
  const percent = percentOf(tile);
  const showImage = Boolean(tile.imageUrl) && !imageFailed;

  return (
    <li
      className={cn(
        "bg-muted relative aspect-square overflow-hidden rounded-lg border",
        BORDER_CLASS[tile.state] ?? "border-border",
        selected && "ring-2 ring-[#1F6B47] ring-offset-2",
      )}
      data-media-tile={tile.key}
      data-tile-state={tile.state}
    >
      <button
        aria-pressed={tile.state === "failed" ? undefined : selected}
        className="focus-visible:ring-ring absolute inset-0 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onActivate}
        type="button"
      >
        {showImage ? (
          // Signed Storage URLs and local blob previews: Next Image would
          // proxy or re-optimize private bytes, so a plain img is used.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={alt}
            className="size-full object-cover"
            decoding="async"
            loading="lazy"
            onError={onImageError}
            src={tile.imageUrl!}
          />
        ) : (
          <span className="text-muted-foreground grid place-items-center gap-1 p-2 text-center text-[12px] leading-4">
            <ImageOff aria-hidden="true" className="size-6" />
            <span className="sr-only">{alt}</span>
            {imageFailed ? (
              <span aria-hidden="true">{MEDIA_COPY.tile.imageFailed}</span>
            ) : null}
          </span>
        )}
        <span className="sr-only">
          {` ${status}`}
          {tile.state === "failed" && tile.autoRetry
            ? ` · ${MEDIA_COPY.tile.autoRetry}`
            : ""}
        </span>
      </button>

      {tile.category ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-1 max-w-[calc(100%-8px)] truncate rounded-full border border-[rgba(22,33,28,.12)] bg-white/95 px-2 text-[12px] leading-5 font-semibold text-[#16211C]"
        >
          {MEDIA_CATEGORY_LABELS[tile.category]}
        </span>
      ) : null}

      {tile.state === "failed" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[rgba(22,33,28,.74)] p-1.5 text-center text-[12px] leading-4 font-semibold text-white"
        >
          <span className="grid size-7 place-items-center rounded-full bg-[#B3261E]">
            <RotateCcw className="size-4" />
          </span>
          {MEDIA_COPY.tile.failed}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-1 text-[12px] leading-4 font-semibold",
            STRIP_CLASS[tile.state],
          )}
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              spinning && "animate-spin motion-reduce:animate-none",
            )}
          />
          <span className="min-w-0">{status}</span>
        </div>
      )}

      {tile.state === "uploading" ? (
        <div
          aria-label={`${MEDIA_COPY.tile.uploading(percent)} · ${alt}`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[rgba(22,33,28,.25)]"
          role="progressbar"
        >
          <div
            className="h-full bg-[#0E7490] transition-[width] duration-150 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

export interface MediaTilePanelProps {
  tile: MediaTile;
  canEdit: boolean;
  blockedReason: string | null;
  isLastWholePlant: boolean;
  choice: MediaCategory | null;
  savingCategory: boolean;
  categoryError: string | null;
  deleteBusy: boolean;
  onChoose: (category: MediaCategory) => void;
  onSend: () => void;
  onSaveCategory: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Details and every action for the selected tile; nothing is hover-only. */
export function MediaTilePanel({
  tile,
  canEdit,
  blockedReason,
  isLastWholePlant,
  choice,
  savingCategory,
  categoryError,
  deleteBusy,
  onChoose,
  onSend,
  onSaveCategory,
  onRetry,
  onCancel,
  onDismiss,
  onDelete,
  onClose,
}: MediaTilePanelProps) {
  const titleId = useId();
  const hintId = useId();
  const guardId = useId();
  const local = tile.local;
  const state = tile.state;

  const localEditable =
    local !== null &&
    local.mediaId === null &&
    (local.stage === "processing" ||
      local.stage === "queued" ||
      local.stage === "failed" ||
      local.stage === "failed_retryable");
  const serverEditable = state === "uploaded" && tile.mediaId !== null;
  const categoryEditable =
    canEdit && (state === "needs_category" || localEditable || serverEditable);
  const categoryLocked =
    local !== null &&
    local.mediaId !== null &&
    (state === "uploading" || state === "waiting" || state === "failed");
  const cancellable =
    local !== null &&
    (state === "processing" ||
      state === "needs_category" ||
      state === "waiting" ||
      state === "uploading" ||
      state === "failed");
  const errorPresentation =
    tile.errorCode &&
    (state === "failed" || state === "rejected" || state === "blocked")
      ? uploadErrorPresentation(tile.errorCode, tile.autoRetry)
      : null;
  const pendingCategory = choice ?? tile.category;
  const categoryChanged =
    pendingCategory !== null && pendingCategory !== tile.category;

  let body: string | null = null;
  if (state === "processing") body = MEDIA_COPY.panel.processingBody;
  if (state === "needs_category") body = MEDIA_COPY.panel.needsCategoryHint;
  if (state === "waiting") {
    body = tile.waitingForNetwork
      ? MEDIA_COPY.panel.waitingOfflineBody
      : MEDIA_COPY.panel.waitingBody;
  }
  if (state === "uploading") body = MEDIA_COPY.panel.uploadingBody;
  if (state === "uploaded") body = MEDIA_COPY.panel.uploadedBody;
  if (state === "retake") body = MEDIA_COPY.panel.retakeBody;
  if (state === "deleting") body = MEDIA_COPY.panel.deletingBody;
  if (state === "cancelling") body = MEDIA_COPY.panel.cancellingBody;

  return (
    <section
      aria-labelledby={titleId}
      className="border-border bg-card grid gap-3 rounded-xl border p-3"
      data-media-panel={tile.key}
      data-panel-state={state}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="pt-2 font-semibold" id={titleId}>
          {MEDIA_COPY.imageAlt(tile.index, tile.category)}
        </h3>
        {state !== "needs_category" ? (
          <Button
            aria-label={`${MEDIA_COPY.panel.close} ${MEDIA_COPY.imageAlt(tile.index, tile.category)}`}
            className="shrink-0 px-3"
            onClick={onClose}
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.close}
          </Button>
        ) : null}
      </div>

      {body ? (
        <p className="text-muted-foreground text-sm leading-6" id={hintId}>
          {body}
        </p>
      ) : null}

      {errorPresentation ? (
        <div
          className="rounded-lg border border-[#F2B8B5] bg-[#FDECEA] p-3 text-sm leading-6 text-[#8C1D18]"
          data-error-code={tile.errorCode}
        >
          <p className="flex items-start gap-2 font-semibold">
            <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
            {errorPresentation.title}
          </p>
          <p className="mt-0.5">{errorPresentation.description}</p>
        </div>
      ) : null}

      {categoryEditable ? (
        <ImageCategoryPicker
          describedBy={body ? hintId : undefined}
          disabled={savingCategory}
          legend={MEDIA_COPY.panel.categoryLegend}
          onChange={onChoose}
          value={pendingCategory}
        />
      ) : null}
      {categoryLocked && canEdit ? (
        <p className="text-muted-foreground text-[13px] leading-5">
          {MEDIA_COPY.panel.categoryLocked}
        </p>
      ) : null}
      {categoryError ? (
        <p className="text-sm leading-6 text-[#8C1D18]" role="alert">
          {categoryError}
        </p>
      ) : null}
      {!canEdit && blockedReason ? (
        <p className="flex items-start gap-2 text-sm leading-6">
          <Lock aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {MEDIA_COPY.blockedPrefix} · {blockedReason}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {state === "needs_category" ? (
          <Button
            disabled={!canEdit || pendingCategory === null}
            onClick={onSend}
          >
            <CloudUpload aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.send}
          </Button>
        ) : null}
        {categoryEditable && state !== "needs_category" ? (
          <Button
            disabled={!categoryChanged || savingCategory}
            onClick={onSaveCategory}
            variant="outline"
          >
            {savingCategory ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Tag aria-hidden="true" className="size-4" />
            )}
            {MEDIA_COPY.panel.saveCategory}
          </Button>
        ) : null}
        {state === "failed" ? (
          <Button onClick={onRetry}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {tile.autoRetry
              ? MEDIA_COPY.panel.retryNow
              : MEDIA_COPY.panel.retry}
          </Button>
        ) : null}
        {cancellable ? (
          <Button onClick={onCancel} variant="outline">
            <X aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.cancel}
          </Button>
        ) : null}
        {state === "rejected" || state === "blocked" ? (
          <Button onClick={onDismiss} variant="outline">
            <X aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.dismiss}
          </Button>
        ) : null}
        {state === "uploaded" && tile.mediaId && canEdit ? (
          <Button
            aria-describedby={isLastWholePlant ? guardId : undefined}
            className="text-[#8C1D18]"
            disabled={isLastWholePlant || deleteBusy}
            onClick={onDelete}
            variant="outline"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.delete}
          </Button>
        ) : null}
        {state === "retake" && canEdit ? (
          <Button
            className="text-[#8C1D18]"
            disabled={deleteBusy}
            onClick={onDelete}
            variant="outline"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.delete}
          </Button>
        ) : null}
        {state === "deleting" &&
        tile.server?.status === "deleting" &&
        canEdit ? (
          <Button disabled={deleteBusy} onClick={onDelete} variant="outline">
            <RotateCcw aria-hidden="true" className="size-4" />
            {MEDIA_COPY.panel.retryDelete}
          </Button>
        ) : null}
      </div>
      {state === "uploaded" && isLastWholePlant && canEdit ? (
        <p
          className="flex items-start gap-2 text-sm leading-6"
          data-delete-guard=""
          id={guardId}
        >
          <Lock aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {MEDIA_COPY.panel.lastWholePlant}
        </p>
      ) : null}
    </section>
  );
}
