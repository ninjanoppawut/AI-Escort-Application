"use client";

import { CircleAlert, CloudOff, Loader2, X } from "lucide-react";

import {
  dismissOutbox,
  useOutbox,
  type OutboxAction,
} from "@/lib/offline/outbox";

import {
  OBSERVATION_ERROR_PRESENTATIONS,
  isObservationUiErrorCode,
} from "../errors";
import { isReviewUiErrorCode, reviewErrorPresentation } from "../review/errors";

function failureText(action: OutboxAction) {
  const code = action.errorCode ?? "FORBIDDEN";
  if (code === "VALIDATION_FAILED" && action.kind === "start_observation") {
    return "ส่งไม่ได้ · เวลาที่เริ่มบันทึกเกิน 15 นาทีหรือไม่ตรงกับระบบ เริ่มบันทึกใหม่อีกครั้ง";
  }
  const presentation = isReviewUiErrorCode(code)
    ? reviewErrorPresentation(code)
    : isObservationUiErrorCode(code)
      ? OBSERVATION_ERROR_PRESENTATIONS[code]
      : OBSERVATION_ERROR_PRESENTATIONS.FORBIDDEN;
  return `ส่งไม่ได้ · ${presentation.title}`;
}

/**
 * Actions kept on this device while offline (OBS-010): waiting, sending, or
 * refused with the reason. They send themselves on reconnect; a refused one
 * stays until the student dismisses it.
 */
export function QueuedActions({
  scope,
  online,
  onSent,
}: {
  scope: string;
  online: boolean;
  onSent: () => void;
}) {
  const { actions, run } = useOutbox(scope, onSent, online);
  if (actions.length === 0) return null;
  return (
    <section
      aria-label="รอส่งจากเครื่องนี้"
      className="grid gap-2 rounded-xl border border-dashed border-[#B08A3E] bg-[#FFF9EE] p-3"
      data-queued-actions={actions.length}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-[#5C3A04]">
        <CloudOff aria-hidden="true" className="size-4" />
        รอส่งจากเครื่องนี้ {actions.length} รายการ
      </p>
      <ul className="grid gap-1.5">
        {actions.map((action) => (
          <li
            className="bg-card flex items-start justify-between gap-2 rounded-[10px] border px-3 py-2 text-sm"
            data-queued-status={action.status}
            key={action.id}
          >
            <span className="flex items-start gap-2">
              {action.status === "sending" ? (
                <Loader2
                  aria-hidden="true"
                  className="mt-1 size-4 animate-spin"
                />
              ) : action.status === "failed" ? (
                <CircleAlert
                  aria-hidden="true"
                  className="mt-1 size-4 text-[#B3261E]"
                />
              ) : (
                <CloudOff aria-hidden="true" className="mt-1 size-4" />
              )}
              <span>
                <span className="font-medium">{action.label}</span>
                <span className="text-muted-foreground block text-[13px]">
                  {action.status === "failed"
                    ? failureText(action)
                    : action.status === "sending"
                      ? "กำลังส่ง..."
                      : online
                        ? "รอส่ง"
                        : "เก็บไว้ในเครื่องแล้ว · จะส่งเองเมื่อกลับมาออนไลน์"}
                </span>
              </span>
            </span>
            {action.status === "failed" ? (
              <button
                aria-label={`ลบ ${action.label} ที่ส่งไม่ได้`}
                className="grid size-11 shrink-0 place-items-center rounded-full border"
                onClick={() => void dismissOutbox(action.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {online && actions.some((action) => action.status === "pending") ? (
        <button
          className="min-h-11 rounded-full border px-4 text-sm font-semibold"
          onClick={run}
          type="button"
        >
          ส่งตอนนี้
        </button>
      ) : null}
    </section>
  );
}
