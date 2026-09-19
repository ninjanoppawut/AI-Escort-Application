"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Siren } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { TELEMETRY_FLOWS } from "@/lib/telemetry/contracts";

import { adminErrorOf, adminGet, adminPost, withQuery } from "../client";
import { adminPageSchema } from "../directory-contracts";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
  incidentKeys,
  incidentSchema,
  incidentSummarySchema,
  openIncidentSchema,
} from "../incident-contracts";
import { FLOW_LABELS } from "../operations-contracts";
import { AdminListStatus, FilterChips, LoadMore } from "./admin-list-states";
import { formatEventTime } from "./explorer-parts";

const STATUS_OPTIONS = [
  { value: "active", label: "ยังไม่ปิด" },
  { value: "resolved", label: "แก้ไขแล้ว" },
  { value: "all", label: "ทั้งหมด" },
] as const;

type StatusOption = (typeof STATUS_OPTIONS)[number]["value"];

const pageSchema = adminPageSchema(incidentSummarySchema);

/** S-admin Incidents (ADM-008): open incidents first, and a way to open one. */
export function IncidentsScreen() {
  const [status, setStatus] = useState<StatusOption>("active");
  const statusFilter = status === "all" ? null : status;
  const query = useInfiniteQuery({
    queryKey: incidentKeys.list(statusFilter),
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery("/api/admin/incidents", {
          status: statusFilter,
          cursor: pageParam,
        }),
        pageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const incidents = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-4">
      <OpenIncidentForm />
      <section aria-labelledby="incidents-title" className="grid gap-3">
        <h2 className="font-semibold" id="incidents-title">
          เหตุการณ์
        </h2>
        <FilterChips
          label="สถานะเหตุการณ์"
          onChange={setStatus}
          options={STATUS_OPTIONS}
          value={status}
        />
        <AdminListStatus
          empty={incidents.length === 0}
          emptyText={
            status === "active"
              ? "ไม่มีเหตุการณ์ที่ยังไม่ปิด"
              : "ไม่มีเหตุการณ์"
          }
          error={query.isError ? adminErrorOf(query.error) : null}
          onRestart={() => void query.refetch()}
          onRetry={() => void query.refetch()}
          pending={query.isPending}
        />
        {incidents.length > 0 ? (
          <ul className="grid gap-2">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  className="border-border bg-card grid gap-1 rounded-xl border p-3 text-sm"
                  data-incident-status={incident.status}
                  href={`/admin/incidents/${incident.id}`}
                >
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <Siren aria-hidden="true" className="size-4" />
                    {incident.title}
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {SEVERITY_LABELS[incident.severity]} ·{" "}
                    {INCIDENT_STATUS_LABELS[incident.status]}
                    {incident.flow
                      ? ` · ${FLOW_LABELS[incident.flow] ?? incident.flow}`
                      : ""}{" "}
                    · บันทึก {incident.noteCount} ·{" "}
                    {formatEventTime(incident.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <LoadMore
          hasMore={Boolean(query.hasNextPage)}
          loading={query.isFetchingNextPage}
          onLoad={() => void query.fetchNextPage()}
        />
      </section>
    </div>
  );
}

function OpenIncidentForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<
    z.input<typeof openIncidentSchema>,
    unknown,
    z.output<typeof openIncidentSchema>
  >({
    resolver: zodResolver(openIncidentSchema),
    defaultValues: { title: "", severity: "sev3", flow: null },
  });
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof openIncidentSchema>) =>
      adminPost("/api/admin/incidents", values, incidentSchema),
    onSuccess: (incident) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
      router.push(`/admin/incidents/${incident.id}`);
    },
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;

  return (
    <form
      aria-labelledby="open-incident-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <h2 className="font-semibold" id="open-incident-title">
        เปิดเหตุการณ์
      </h2>
      <label className="grid gap-1 text-sm font-medium">
        ชื่อเหตุการณ์
        <input
          aria-invalid={Boolean(form.formState.errors.title) || undefined}
          className="border-border min-h-11 rounded-[10px] border px-3 font-normal"
          {...form.register("title")}
        />
      </label>
      {form.formState.errors.title ? (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {form.formState.errors.title.message}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          ความรุนแรง
          <select
            className="border-border min-h-11 rounded-[10px] border px-3 font-normal"
            {...form.register("severity")}
          >
            {INCIDENT_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          ขั้นตอนที่ได้รับผลกระทบ
          <select
            className="border-border min-h-11 rounded-[10px] border px-3 font-normal"
            {...form.register("flow", {
              setValueAs: (value: string) => (value ? value : null),
            })}
          >
            <option value="">ไม่ระบุ</option>
            {TELEMETRY_FLOWS.map((flow) => (
              <option key={flow} value={flow}>
                {FLOW_LABELS[flow] ?? flow}
              </option>
            ))}
          </select>
        </label>
      </div>
      {failure ? (
        <p
          className="text-sm text-[#8C1D18]"
          data-admin-error={failure.code}
          role="alert"
        >
          {failure.message}
        </p>
      ) : null}
      <Button disabled={mutation.isPending} size="lg" type="submit">
        <Siren aria-hidden="true" className="size-4" />
        {mutation.isPending ? "กำลังเปิด..." : "เปิดเหตุการณ์"}
      </Button>
    </form>
  );
}
