"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleCheck, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";

import { adminErrorOf, adminGet, adminPost } from "../client";
import {
  INCIDENT_RUNBOOK,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
  incidentKeys,
  incidentNoteInputSchema,
  incidentSchema,
  resolveIncidentSchema,
  type Incident,
} from "../incident-contracts";
import { FLOW_LABELS } from "../operations-contracts";
import { AdminListStatus } from "./admin-list-states";
import { formatEventTime } from "./explorer-parts";

/**
 * S-admin Incident detail (ADM-008): acknowledge, append notes (never edit
 * or delete), follow the runbook, and close with a written resolution.
 * Source audit and error events are not changed here.
 */
export function IncidentDetailScreen({ incidentId }: { incidentId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: incidentKeys.detail(incidentId),
    queryFn: () =>
      adminGet(`/api/admin/incidents/${incidentId}`, incidentSchema),
    retry: false,
  });
  const store = (incident: Incident) => {
    queryClient.setQueryData(incidentKeys.detail(incidentId), incident);
    void queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
  };
  const acknowledge = useMutation({
    mutationFn: () =>
      adminPost(
        `/api/admin/incidents/${incidentId}/acknowledge`,
        {},
        incidentSchema,
      ),
    onSuccess: store,
  });

  if (!query.data) {
    return (
      <AdminListStatus
        empty={false}
        emptyText=""
        error={query.isError ? adminErrorOf(query.error) : null}
        onRestart={() => void query.refetch()}
        onRetry={() => void query.refetch()}
        pending={query.isPending}
      />
    );
  }

  const incident = query.data;
  const ackFailure = acknowledge.isError
    ? adminErrorOf(acknowledge.error)
    : null;
  return (
    <div className="grid gap-4" data-incident-status={incident.status}>
      <section className="border-border bg-card grid gap-2 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{incident.title}</h2>
        <p className="text-sm">
          {SEVERITY_LABELS[incident.severity]} ·{" "}
          <span className="font-semibold">
            {INCIDENT_STATUS_LABELS[incident.status]}
          </span>
          {incident.flow
            ? ` · ${FLOW_LABELS[incident.flow] ?? incident.flow}`
            : ""}
        </p>
        <p className="text-muted-foreground text-[13px]">
          เปิด {formatEventTime(incident.createdAt)}
          {incident.acknowledgedAt
            ? ` · รับทราบ ${formatEventTime(incident.acknowledgedAt)}`
            : ""}
          {incident.resolvedAt
            ? ` · แก้ไขแล้ว ${formatEventTime(incident.resolvedAt)}`
            : ""}
        </p>
        {incident.status === "open" ? (
          <Button
            disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate()}
            size="lg"
          >
            <CheckCheck aria-hidden="true" className="size-4" />
            รับทราบเหตุการณ์
          </Button>
        ) : null}
        {ackFailure ? (
          <p className="text-sm text-[#8C1D18]" role="alert">
            {ackFailure.message}
          </p>
        ) : null}
        {incident.resolution ? (
          <p
            className="rounded-[10px] border border-[#9CC5AE] bg-[#EAF4EE] p-3 text-sm leading-6 text-[#14472F]"
            data-incident-resolution=""
          >
            <CircleCheck aria-hidden="true" className="mr-1 inline size-4" />
            {incident.resolution}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="runbook-title"
        className="border-border bg-card grid gap-2 rounded-xl border p-4"
      >
        <h2 className="font-semibold" id="runbook-title">
          คู่มือรับมือเหตุการณ์
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6">
          {INCIDENT_RUNBOOK.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-muted-foreground text-[13px]">
          อย่าคัดลอกข้อมูลนักเรียน รูปภาพ หรือตำแหน่งลงในบันทึก ใช้ Request ID
          แทน
        </p>
      </section>

      <section aria-labelledby="notes-title" className="grid gap-2">
        <h2 className="font-semibold" id="notes-title">
          บันทึกเหตุการณ์
        </h2>
        {incident.notes.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-admin-empty="">
            ยังไม่มีบันทึก
          </p>
        ) : (
          <ol
            className="grid gap-2"
            data-incident-notes={incident.notes.length}
          >
            {incident.notes.map((note) => (
              <li
                className="border-border bg-card rounded-xl border p-3 text-sm leading-6"
                key={note.id}
              >
                <p className="whitespace-pre-wrap">{note.note}</p>
                <p className="text-muted-foreground text-[12px]">
                  {note.byMe ? "คุณ · " : ""}
                  {formatEventTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
        <NoteForm incidentId={incidentId} onSaved={store} />
      </section>

      {incident.status !== "resolved" ? (
        <ResolveForm incidentId={incidentId} onResolved={store} />
      ) : null}
    </div>
  );
}

function NoteForm({
  incidentId,
  onSaved,
}: {
  incidentId: string;
  onSaved: (incident: Incident) => void;
}) {
  // One client note ID per note text, kept across retries, so a lost
  // response never adds the same note twice; edited text is a new note.
  const [pendingNote, setPendingNote] = useState<{
    text: string;
    id: string;
  } | null>(null);
  const form = useForm<{ note: string }>({ defaultValues: { note: "" } });
  const [invalid, setInvalid] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: z.output<typeof incidentNoteInputSchema>) =>
      adminPost(
        `/api/admin/incidents/${incidentId}/notes`,
        body,
        incidentSchema,
      ),
    onSuccess: (incident) => {
      setPendingNote(null);
      form.reset({ note: "" });
      onSaved(incident);
    },
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;

  return (
    <form
      aria-label="เพิ่มบันทึกเหตุการณ์"
      className="grid gap-2"
      noValidate
      onSubmit={form.handleSubmit(({ note }) => {
        const current =
          pendingNote?.text === note
            ? pendingNote
            : { text: note, id: crypto.randomUUID() };
        setPendingNote(current);
        const parsed = incidentNoteInputSchema.safeParse({
          note,
          clientNoteId: current.id,
        });
        if (!parsed.success) {
          setInvalid(parsed.error.issues[0]?.message ?? "บันทึกไม่ถูกต้อง");
          return;
        }
        setInvalid(null);
        mutation.mutate(parsed.data);
      })}
    >
      <label className="grid gap-1 text-sm font-medium">
        บันทึกใหม่
        <textarea
          className="border-border min-h-20 rounded-[10px] border px-3 py-2 font-normal"
          {...form.register("note")}
        />
      </label>
      {invalid || failure ? (
        <p
          className="text-sm text-[#8C1D18]"
          data-admin-error={failure?.code}
          role="alert"
        >
          {invalid ??
            (failure?.code === "NETWORK"
              ? "ยังไม่รู้ว่าบันทึกแล้วหรือไม่ กดบันทึกอีกครั้งได้ ระบบจะไม่เพิ่มซ้ำ"
              : failure?.message)}
        </p>
      ) : null}
      <Button disabled={mutation.isPending} size="lg" type="submit">
        <MessageSquarePlus aria-hidden="true" className="size-4" />
        {mutation.isPending ? "กำลังบันทึก..." : "เพิ่มบันทึก"}
      </Button>
    </form>
  );
}

function ResolveForm({
  incidentId,
  onResolved,
}: {
  incidentId: string;
  onResolved: (incident: Incident) => void;
}) {
  const form = useForm<z.input<typeof resolveIncidentSchema>>({
    resolver: zodResolver(resolveIncidentSchema),
    defaultValues: { resolution: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof resolveIncidentSchema>) =>
      adminPost(
        `/api/admin/incidents/${incidentId}/resolve`,
        values,
        incidentSchema,
      ),
    onSuccess: onResolved,
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;

  return (
    <form
      aria-labelledby="resolve-incident-title"
      className="grid gap-2 rounded-xl border border-[#9CC5AE] p-4"
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <h2 className="font-semibold" id="resolve-incident-title">
        ปิดเหตุการณ์
      </h2>
      <label className="grid gap-1 text-sm font-medium">
        สิ่งที่แก้ไขและสาเหตุ
        <textarea
          aria-invalid={Boolean(form.formState.errors.resolution) || undefined}
          className="border-border min-h-20 rounded-[10px] border px-3 py-2 font-normal"
          {...form.register("resolution")}
        />
      </label>
      {form.formState.errors.resolution || failure ? (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {form.formState.errors.resolution?.message ?? failure?.message}
        </p>
      ) : null}
      <Button disabled={mutation.isPending} size="lg" type="submit">
        <CircleCheck aria-hidden="true" className="size-4" />
        ปิดเหตุการณ์
      </Button>
    </form>
  );
}
