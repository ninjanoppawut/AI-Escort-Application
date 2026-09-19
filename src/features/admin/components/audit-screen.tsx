"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { adminErrorOf, adminGet, withQuery } from "../client";
import { adminPageSchema } from "../directory-contracts";
import {
  auditEventSchema,
  auditFilterSchema,
  operationsKeys,
  type AuditFilter,
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

const pageSchema = adminPageSchema(auditEventSchema);

const OUTCOME_LABELS = {
  succeeded: "สำเร็จ",
  denied: "ถูกปฏิเสธ",
  failed: "ล้มเหลว",
} as const;

interface Draft {
  action: string;
  resourceType: string;
  outcome: string;
  actorId: string;
  requestId: string;
}

function toFilter(draft: Draft, range: RangeOption): AuditFilter | null {
  const parsed = auditFilterSchema.safeParse({
    from: rangeFrom(range),
    to: null,
    actorId: draft.actorId.trim() || null,
    action: draft.action.trim().toLowerCase() || null,
    resourceType: draft.resourceType.trim().toLowerCase() || null,
    outcome: draft.outcome || null,
    requestId: draft.requestId.trim() || null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * S-admin Audit explorer (ADM-004): append-only audit records filtered by
 * time, actor, action, resource, outcome, and request ID. Records are read
 * only; this view has no edit path.
 */
export function AuditScreen() {
  const [range, setRange] = useState<RangeOption>("24");
  const [draft, setDraft] = useState<Draft>({
    action: "",
    resourceType: "",
    outcome: "",
    actorId: "",
    requestId: "",
  });
  const [filter, setFilter] = useState<AuditFilter | null>(() =>
    toFilter(draft, range),
  );
  const [invalid, setInvalid] = useState(false);

  const query = useInfiniteQuery({
    queryKey: operationsKeys.audit(filter!),
    enabled: filter !== null,
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery("/api/admin/audit-events", {
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
        aria-label="ตัวกรองบันทึกการใช้งาน"
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
          <TextFilter
            label="การกระทำ"
            name="action"
            onChange={(action) => setDraft({ ...draft, action })}
            placeholder="เช่น admin.school"
            value={draft.action}
          />
          <TextFilter
            label="ประเภททรัพยากร"
            name="resourceType"
            onChange={(resourceType) => setDraft({ ...draft, resourceType })}
            placeholder="เช่น school"
            value={draft.resourceType}
          />
          <label className="grid gap-1 text-sm font-medium">
            ผลลัพธ์
            <select
              className="border-border min-h-11 rounded-[10px] border px-3 font-normal"
              name="outcome"
              onChange={(event) =>
                setDraft({ ...draft, outcome: event.target.value })
              }
              value={draft.outcome}
            >
              <option value="">ทั้งหมด</option>
              <option value="succeeded">สำเร็จ</option>
              <option value="denied">ถูกปฏิเสธ</option>
              <option value="failed">ล้มเหลว</option>
            </select>
          </label>
          <TextFilter
            label="ผู้กระทำ (User ID)"
            name="actorId"
            onChange={(actorId) => setDraft({ ...draft, actorId })}
            value={draft.actorId}
          />
          <TextFilter
            label="Request ID"
            name="requestId"
            onChange={(requestId) => setDraft({ ...draft, requestId })}
            value={draft.requestId}
          />
        </div>
        {invalid ? (
          <p className="text-sm text-[#8C1D18]" role="alert">
            ตัวกรองไม่ถูกต้อง ตรวจรูปแบบ ID หรือการกระทำ
          </p>
        ) : null}
        <Button size="lg" type="submit">
          <Search aria-hidden="true" className="size-4" />
          ค้นหา
        </Button>
      </form>

      <AdminListStatus
        empty={events.length === 0}
        emptyText="ไม่พบบันทึกในช่วงเวลานี้"
        error={query.isError ? adminErrorOf(query.error) : null}
        onRestart={() => apply()}
        onRetry={() => void query.refetch()}
        pending={filter !== null && query.isPending}
      />
      {events.length > 0 ? (
        <ul className="grid gap-2" data-audit-events={events.length}>
          {events.map((event) => (
            <li
              className="border-border bg-card rounded-xl border text-sm"
              data-audit-action={event.action}
              data-audit-outcome={event.outcome}
              key={event.id}
            >
              <details>
                <summary className="grid min-h-11 cursor-pointer gap-1 p-3">
                  <span className="flex flex-wrap items-center gap-2 font-semibold break-all">
                    {event.action}
                    <span className="rounded-full border px-2 text-[12px] font-medium">
                      {OUTCOME_LABELS[event.outcome]}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {event.actorKind} · {event.resourceType} ·{" "}
                    {formatEventTime(event.createdAt)}
                  </span>
                </summary>
                <div className="grid gap-2 border-t p-3">
                  <DetailRows
                    rows={[
                      ["ผู้กระทำ", event.actorId],
                      ["ทรัพยากร", event.resourceId],
                      ["โรงเรียน", event.schoolId],
                      ["ห้องเรียน", event.classId],
                      ["Request ID", event.requestId],
                      ["Trace ID", event.traceId],
                    ]}
                  />
                  <JsonBlock value={event.payload} />
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
