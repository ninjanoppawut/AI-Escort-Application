"use client";

import type { ReactNode } from "react";

// Shared pieces of the audit and error explorers: bounded time ranges
// (24 hours default, 31 days at most) and the immutable detail view.

export const RANGE_OPTIONS = [
  { value: "1", label: "1 ชั่วโมง" },
  { value: "24", label: "24 ชั่วโมง" },
  { value: "168", label: "7 วัน" },
  { value: "744", label: "31 วัน" },
] as const;

export type RangeOption = (typeof RANGE_OPTIONS)[number]["value"];

export function rangeFrom(range: RangeOption, now = Date.now()) {
  return new Date(now - Number(range) * 60 * 60 * 1000).toISOString();
}

const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
});

export function formatEventTime(value: string) {
  return timeFormatter.format(new Date(value));
}

export function DetailRows({
  rows,
}: {
  rows: readonly [label: string, value: ReactNode][];
}) {
  return (
    <dl className="grid gap-1 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono break-all">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ value }: { value: Record<string, unknown> }) {
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground text-[13px]">
        ไม่มีรายละเอียดเพิ่มเติม
      </p>
    );
  }
  return (
    <pre className="bg-muted overflow-x-auto rounded-md p-2 text-[12px] break-all whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function TextFilter({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        autoComplete="off"
        className="border-border min-h-11 min-w-0 rounded-[10px] border px-3 font-normal"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
