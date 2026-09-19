"use client";

import { CircleAlert, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import type { AdminApiError } from "../client";

/** Loading, failure (with retry or restart), and empty states for lists. */
export function AdminListStatus({
  pending,
  error,
  empty,
  emptyText,
  onRetry,
  onRestart,
}: {
  pending: boolean;
  error: AdminApiError | null;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
  onRestart: () => void;
}) {
  if (pending) {
    return (
      <p className="flex items-center gap-2 text-sm" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        กำลังโหลด...
      </p>
    );
  }
  if (error) {
    const restart = error.code === "INVALID_CURSOR";
    return (
      <div
        className="grid gap-2 rounded-xl border border-[#F2B8B5] bg-[#FDECEA] p-3 text-sm text-[#8C1D18]"
        data-admin-error={error.code}
        role="alert"
      >
        <p className="flex items-start gap-2">
          <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {error.message}
        </p>
        <Button
          onClick={restart ? onRestart : onRetry}
          size="lg"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {restart ? "เริ่มจากหน้าแรก" : "ลองอีกครั้ง"}
        </Button>
      </div>
    );
  }
  if (empty) {
    return (
      <p
        className="border-border bg-card rounded-xl border border-dashed p-4 text-sm"
        data-admin-empty=""
      >
        {emptyText}
      </p>
    );
  }
  return null;
}

export function LoadMore({
  hasMore,
  loading,
  onLoad,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
}): ReactNode {
  if (!hasMore) return null;
  return (
    <Button disabled={loading} onClick={onLoad} size="lg" variant="outline">
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : null}
      โหลดเพิ่ม
    </Button>
  );
}

export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={
            value === option.value
              ? "min-h-11 rounded-full border border-[#1F5C3A] bg-[#1F5C3A] px-4 text-sm font-medium text-white"
              : "border-border bg-card min-h-11 rounded-full border px-4 text-sm font-medium"
          }
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
