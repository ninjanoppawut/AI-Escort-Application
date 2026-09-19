"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TELEMETRY_FLOWS } from "@/lib/telemetry/contracts";

import { adminErrorOf, adminGet, withQuery } from "../client";
import { adminPageSchema } from "../directory-contracts";
import {
  FLOW_LABELS,
  errorEventSchema,
  errorFilterSchema,
  operationsKeys,
  type ErrorFilter,
} from "../operations-contracts";
import { AdminListStatus, FilterChips, LoadMore } from "./admin-list-states";
import {
  DetailRows,
  JsonBlock,
  RANGE_OPTIONS,
  TextFilter,
  formatEventTime,
  rangeFrom,
  type RangeOption,
} from "./explorer-parts";

const pageSchema = adminPageSchema(errorEventSchema);

const SEVERITY_LABELS = {
  info: "ข้อมูล",
  warning: "คำเตือน",
  error: "ข้อผิดพลาด",
  critical: "วิกฤต",
} as const;

interface Draft {
  flow: string;
  code: string;
  stage: string;
  requestId: string;
  release: string;
}

function toFilter(draft: Draft, range: RangeOption): ErrorFilter | null {
  const parsed = errorFilterSchema.safeParse({
    from: rangeFrom(range),
    to: null,
    flow: draft.flow || null,
    stage: draft.stage.trim() || null,
    code: draft.code.trim().toUpperCase() || null,
    release: draft.release.trim() || null,
    environment: null,
    requestId: draft.requestId.trim() || null,
    traceId: null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * S-admin Flow errors (ADM-005): filter by flow, stage, code, release, and
 * request ID over a bounded range; each event opens its redacted detail.
 */
export function ErrorsScreen({ initialFlow }: { initialFlow: string | null }) {
  const [range, setRange] = useState<RangeOption>("24");
  const [draft, setDraft] = useState<Draft>({
    flow: initialFlow ?? "",
    code: "",
    stage: "",
    requestId: "",
    release: "",
  });
  const [filter, setFilter] = useState<ErrorFilter | null>(() =>
    toFilter(draft, range),
  );
  const [invalid, setInvalid] = useState(false);

  const query = useInfiniteQuery({
    queryKey: operationsKeys.errors(filter!),
    enabled: filter !== null,
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery("/api/admin/errors", {
          ...Object.fromEntries(
            Object.entries(filter ?? {}).map(([key, value]) => [
              key,
              value ?? null,
            ]),
          ),
          cursor: pageParam,
        }),
        pageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const events = query.data?.pages.flatMap((page) => page.items) ?? [];

  function apply(nextRange = range) {
    const next = toFilter(draft, nextRange);
    setInvalid(next === null);
    if (next) setFilter(next);
  }

  return (
    <div className="grid gap-3">
      <form
        aria-label="ตัวกรองข้อผิดพลาด"
        className="border-border bg-card grid gap-3 rounded-xl border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <FilterChips
          label="ช่วงเวลา"
          onChange={(value) => {
            setRange(value);
            apply(value);
          }}
          options={RANGE_OPTIONS}
          value={range}
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">
            ขั้นตอน
            <select
              className="border-border min-h-11 rounded-[10px] border px-3 font-normal"
              name="flow"
              onChange={(event) =>
                setDraft({ ...draft, flow: event.target.value })
              }
              value={draft.flow}
            >
              <option value="">ทุกขั้นตอน</option>
              {TELEMETRY_FLOWS.map((flow) => (
                <option key={flow} value={flow}>
                  {FLOW_LABELS[flow] ?? flow}
                </option>
              ))}
            </select>
          </label>
          <TextFilter
            label="รหัสข้อผิดพลาด"
            name="code"
            onChange={(code) => setDraft({ ...draft, code })}
            placeholder="เช่น IMAGE_TOO_LARGE"
            value={draft.code}
          />
          <TextFilter
            label="จุดที่เกิด (stage)"
            name="stage"
            onChange={(stage) => setDraft({ ...draft, stage })}
            value={draft.stage}
          />
          <TextFilter
            label="Request ID"
            name="requestId"
            onChange={(requestId) => setDraft({ ...draft, requestId })}
            value={draft.requestId}
          />
          <TextFilter
            label="รุ่นที่ปล่อย (release)"
            name="release"
            onChange={(release) => setDraft({ ...draft, release })}
            value={draft.release}
          />
        </div>
        {invalid ? (
          <p className="text-sm text-[#8C1D18]" role="alert">
            ตัวกรองไม่ถูกต้อง ตรวจรูปแบบรหัสหรือ Request ID
          </p>
        ) : null}
        <Button size="lg" type="submit">
          <Search aria-hidden="true" className="size-4" />
          ค้นหา
        </Button>
      </form>

      <AdminListStatus
        empty={events.length === 0}
        emptyText="ไม่พบข้อผิดพลาดในช่วงเวลานี้"
        error={query.isError ? adminErrorOf(query.error) : null}
        onRestart={() => apply()}
        onRetry={() => void query.refetch()}
        pending={filter !== null && query.isPending}
      />
      {events.length > 0 ? (
        <ul className="grid gap-2" data-error-events={events.length}>
          {events.map((event) => (
            <li
              className="border-border bg-card rounded-xl border text-sm"
              data-error-code={event.errorCode}
              data-severity={event.severity}
              key={event.id}
            >
              <details>
                <summary className="grid min-h-11 cursor-pointer gap-1 p-3">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {event.errorCode}
                    <span className="rounded-full border px-2 text-[12px] font-medium">
                      {SEVERITY_LABELS[event.severity]}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {FLOW_LABELS[event.flow] ?? event.flow} · {event.stage} ·{" "}
                    {formatEventTime(event.createdAt)}
                  </span>
                </summary>
                <div className="grid gap-2 border-t p-3">
                  <DetailRows
                    rows={[
                      ["แหล่งที่มา", event.source],
                      ["สภาพแวดล้อม", event.environment],
                      ["รุ่นที่ปล่อย", event.releaseVersion],
                      ["Fingerprint", event.fingerprint],
                      ["Request ID", event.requestId],
                      ["Trace ID", event.traceId],
                      ["ได้รับเมื่อ", formatEventTime(event.receivedAt)],
                    ]}
                  />
                  <JsonBlock value={event.context} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
      <LoadMore
        hasMore={Boolean(query.hasNextPage)}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
      />
    </div>
  );
}
