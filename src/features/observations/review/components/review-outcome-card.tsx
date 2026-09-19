"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  BadgeCheck,
  CircleHelp,
  Eye,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { fetchObservationJson } from "../../client/request";
import { TRAIT_LABELS } from "../review-form";
import {
  REVISION_TOPIC_LABELS,
  revisionQueryKeys,
  revisionStateSchema,
} from "../revision-contracts";

const REVIEWED_STATUSES = new Set([
  "teacher_review",
  "revision_required",
  "resubmitted",
  "verified",
  "unable_to_verify",
  "rejected",
]);

/**
 * The owner's view of the teacher's result (D-057: feedback goes to the owner
 * only): verified identity and corrections beside what the student wrote, the
 * reason for unable-to-verify or rejection, or the way into a revision.
 */
export function ReviewOutcomeCard({
  observationId,
  status,
}: {
  observationId: string;
  status: string;
}) {
  const reviewed = REVIEWED_STATUSES.has(status);
  const stateQuery = useQuery({
    queryKey: revisionQueryKeys.state(observationId),
    queryFn: () =>
      fetchObservationJson(
        `/api/observations/${observationId}/revision`,
        revisionStateSchema,
      ),
    enabled: reviewed,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  if (!reviewed) return null;

  if (status === "teacher_review" || status === "resubmitted") {
    return (
      <section
        className="border-border bg-card flex items-start gap-3 rounded-xl border p-4 text-sm"
        data-review-outcome={status}
        role="status"
      >
        {status === "teacher_review" ? (
          <Eye aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        ) : (
          <RefreshCw aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        )}
        <p className="leading-6">
          {status === "teacher_review"
            ? "ครูกำลังตรวจรายการนี้"
            : "ส่งฉบับแก้ไขแล้ว · รอครูตรวจ"}
        </p>
      </section>
    );
  }

  const state = stateQuery.data;
  const review = state?.latestReview;
  const tone =
    status === "verified"
      ? "border-[#B7D8C2] bg-[#EEF7F1] text-[#16432A]"
      : status === "revision_required"
        ? "border-[#F2B8B5] bg-[#FDECEA] text-[#5C1712]"
        : "border-border bg-card";

  return (
    <section
      aria-labelledby="review-outcome-title"
      className={cn("grid gap-2 rounded-xl border p-4 text-sm leading-6", tone)}
      data-review-outcome={status}
    >
      <h2
        className="flex items-center gap-2 font-semibold"
        id="review-outcome-title"
      >
        {status === "verified" ? (
          <BadgeCheck aria-hidden="true" className="size-5" />
        ) : status === "revision_required" ? (
          <RotateCcw aria-hidden="true" className="size-5" />
        ) : status === "unable_to_verify" ? (
          <CircleHelp aria-hidden="true" className="size-5" />
        ) : (
          <Ban aria-hidden="true" className="size-5" />
        )}
        {status === "verified"
          ? "ครูยืนยันแล้ว"
          : status === "revision_required"
            ? "ครูขอให้แก้ไข"
            : status === "unable_to_verify"
              ? "ครูยังยืนยันไม่ได้"
              : "ครูไม่รับรายการนี้"}
      </h2>
      {stateQuery.isPending ? (
        <p className="text-muted-foreground">กำลังโหลดผลการตรวจ...</p>
      ) : null}
      {stateQuery.isError ? (
        <p>
          โหลดผลการตรวจไม่สำเร็จ ·{" "}
          <button
            className="font-medium underline underline-offset-2"
            onClick={() => void stateQuery.refetch()}
            type="button"
          >
            ลองใหม่
          </button>
        </p>
      ) : null}
      {status === "verified" && state?.verifiedIdentity ? (
        <p data-verified-identity="">
          {state.verifiedIdentity.commonName} ·{" "}
          <i className="font-serif" lang="la">
            {state.verifiedIdentity.scientificName}
          </i>
          {state.current.scientificName &&
          state.current.scientificName !==
            state.verifiedIdentity.scientificName ? (
            <span className="block text-[13px]">
              คุณบันทึกว่า{" "}
              <i className="font-serif" lang="la">
                {state.current.scientificName}
              </i>{" "}
              · ค่าของคุณยังเก็บไว้
            </span>
          ) : null}
        </p>
      ) : null}
      {review
        ? Object.entries(review.correctedTraits).map(([key, value]) => (
            <p key={key}>
              ครูแก้ลักษณะ {TRAIT_LABELS[key] ?? key}: “{value}”
            </p>
          ))
        : null}
      {review?.feedback ? (
        <p className="whitespace-pre-line">“{review.feedback}”</p>
      ) : null}
      {status === "revision_required" && state ? (
        <>
          <p>
            หัวข้อที่ต้องแก้:{" "}
            {state.openTopics
              .map((topic) => REVISION_TOPIC_LABELS[topic])
              .join(" · ")}
          </p>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1F5C3A] px-5 font-semibold text-white"
            href={`/observations/${observationId}/revision`}
          >
            เริ่มแก้ไข
          </Link>
        </>
      ) : null}
    </section>
  );
}
