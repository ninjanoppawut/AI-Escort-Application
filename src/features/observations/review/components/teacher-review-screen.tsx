"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Flag,
  ImageOff,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { formatClockTime } from "@/features/sessions/components/session-freshness";
import { cn } from "@/lib/utils";

import {
  LOCATION_UNAVAILABLE_REASON_LABELS,
  formatCaptureTime,
  formatCoordinate,
} from "../../capture";
import {
  fetchObservationJson,
  sendObservationJson,
} from "../../client/request";
import { ObservationStatusBadge } from "../../components/observation-status-badge";
import {
  observationStatusSchema,
  type ObservationStatus,
} from "../../contracts";
import { MEDIA_CATEGORY_LABELS } from "../../media/contracts";
import { presentReviewError, reviewErrorCodeOf } from "../client";
import { isReviewUiErrorCode } from "../errors";
import { reviewQueryKeys, type ObservationRelation } from "../contracts";
import {
  beginReviewResponseSchema,
  teacherReviewDetailViewSchema,
  type TeacherReviewDetail,
} from "../revision-contracts";
import { TRAIT_LABELS, TRAIT_MODE_LABELS } from "../review-form";
import { TeacherDecisionPanel } from "./teacher-decision-panel";
import {
  ReportsList,
  ReviewHistory,
  UnlockRequestsSection,
} from "./teacher-review-extras";

type TeacherReview = TeacherReviewDetail;
type Submission = TeacherReview["submissions"][number];
type Decision = "same_specimen" | "not_same_specimen";

const DECISION_LABELS: Record<Decision, string> = {
  same_specimen: "ต้นเดียวกัน",
  not_same_specimen: "คนละต้น",
};

const decisionResponseSchema = z
  .object({
    outcome: z.enum(["decided", "unchanged"]),
    relationId: z.uuid(),
    decision: z.enum(["same_specimen", "not_same_specimen"]).nullable(),
  })
  .strict();

function fetchTeacherReview(observationId: string) {
  return fetchObservationJson(
    `/api/reviews/${observationId}`,
    teacherReviewDetailViewSchema,
  );
}

function statusOf(value: string): ObservationStatus | null {
  const parsed = observationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function formatDistance(distanceM: number | null) {
  if (distanceM === null) return null;
  return `ห่าง ${Math.round(distanceM)} ม.`;
}

function formatGap(seconds: number | null) {
  if (seconds === null) return null;
  const minutes = Math.round(Math.abs(seconds) / 60);
  return minutes < 1 ? "เวลาใกล้กัน" : `ห่างกัน ${minutes} นาที`;
}

interface VerificationTrait {
  traitKey: string;
  status: string | null;
  value: string | null;
  note: string | null;
}

function traitsOf(verification: Record<string, unknown>): VerificationTrait[] {
  const traits = verification.traits;
  if (!Array.isArray(traits)) return [];
  return traits.flatMap((trait) => {
    if (!trait || typeof trait !== "object") return [];
    const row = trait as Record<string, unknown>;
    if (typeof row.traitKey !== "string") return [];
    return [
      {
        traitKey: row.traitKey,
        status: typeof row.status === "string" ? row.status : null,
        value: typeof row.value === "string" ? row.value : null,
        note: typeof row.note === "string" ? row.note : null,
      },
    ];
  });
}

/**
 * Teacher view of a submitted observation (REV-004–REV-006, P11-05): every
 * submitted version with its images, capture metadata, and the student's
 * trait checks, the same-species tag, and possible same-specimen candidates
 * that only the teacher confirms. Nothing is merged, deleted, or rejected by
 * a relationship decision.
 */
export function TeacherReviewScreen({
  observationId,
  initialReview,
  initialErrorCode,
  highlightRequestId = null,
}: {
  observationId: string;
  initialReview: TeacherReview | null;
  initialErrorCode: string | null;
  /** The unlock request a `revision_access_requested` deep link points at. */
  highlightRequestId?: string | null;
}) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({
    queryKey: reviewQueryKeys.teacher(observationId),
    queryFn: () => fetchTeacherReview(observationId),
    ...(initialReview ? { initialData: initialReview } : {}),
    enabled: initialErrorCode === null || initialReview !== null,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const review = reviewQuery.data;
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: reviewQueryKeys.teacher(observationId),
    });
    void queryClient.invalidateQueries({ queryKey: ["reviews", "queue"] });
  };

  // Opening a submitted or resubmitted record begins its review (D-067).
  const begin = useMutation({
    mutationFn: () =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/review/start`,
        {},
        beginReviewResponseSchema,
      ),
    onSuccess: (result) => {
      if (result.outcome === "started") invalidate();
    },
  });
  const canBegin = Boolean(review?.permissions.canBegin) && online;
  const beginRequested = useRef(false);
  useEffect(() => {
    if (!canBegin || beginRequested.current) return;
    beginRequested.current = true;
    begin.mutate();
  }, [begin, canBegin]);

  if (!review) {
    const code = reviewQuery.error
      ? reviewErrorCodeOf(reviewQuery.error)
      : initialErrorCode;
    return (
      <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
        <div className="mx-auto grid max-w-3xl gap-4">
          {code ? (
            <ReviewDenied
              code={code}
              onRetry={() => void reviewQuery.refetch()}
              retrying={reviewQuery.isFetching}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              กำลังโหลดรายการพืช...
            </p>
          )}
        </div>
      </main>
    );
  }

  const latest = review.submissions[0] ?? null;
  const older = review.submissions.slice(1);
  const status = statusOf(review.status);
  const specimenRelations = review.relations.filter(
    (relation) => relation.relationshipType === "possible_same_specimen",
  );
  const speciesRelations = review.relations.filter(
    (relation) => relation.relationshipType === "same_species",
  );

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-3xl content-start gap-4 px-4 pt-4 pb-8 sm:px-8">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรอบสำรวจ"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/teacher/classes/${review.classId}/sessions/${review.session.id}`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {review.activity.title} · {review.session.title}
            </p>
            <h1 className="text-xl font-bold break-words">
              {latest?.commonName ?? "รายการพืช"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {review.student.displayName ?? "นักเรียน"}
              {review.groupName ? ` · กลุ่ม ${review.groupName}` : ""}
            </p>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {status ? <ObservationStatusBadge status={status} /> : null}
          {review.sameSpecies.inSession ? (
            <span
              className="inline-flex min-h-7 items-center gap-1.5 rounded-[6px] border border-[#E8C58A] bg-[#FFF6E5] px-2.5 text-[13px] font-medium text-[#5C3A04]"
              data-tag="same_species"
            >
              <Copy aria-hidden="true" className="size-3.5" />
              ชนิดซ้ำในรอบนี้ · อีก {review.sameSpecies.count} รายการ
            </span>
          ) : null}
          {specimenRelations.length > 0 ? (
            <span
              className="inline-flex min-h-7 items-center gap-1.5 rounded-[6px] border border-[#C9B8EC] bg-[#F3EEFC] px-2.5 text-[13px] font-medium text-[#3E2379]"
              data-tag="possible_same_specimen"
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              อาจเป็นต้นเดียวกัน {specimenRelations.length} รายการ
            </span>
          ) : null}
        </div>

        <p
          className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
          role="status"
        >
          <RefreshCw
            aria-hidden="true"
            className={
              reviewQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"
            }
          />
          {reviewQuery.isFetching ? (
            "กำลังอัปเดต..."
          ) : (
            <span suppressHydrationWarning>
              อัปเดตล่าสุด {formatClockTime(review.refreshedAt)}
            </span>
          )}
        </p>

        {reviewQuery.isError ? (
          <section
            className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            role="alert"
          >
            <span className="min-w-0 flex-1 leading-6">
              อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้
            </span>
            <Button
              disabled={reviewQuery.isFetching}
              onClick={() => void reviewQuery.refetch()}
              variant="outline"
            >
              ลองใหม่
            </Button>
          </section>
        ) : null}

        <CaptureSummary capture={review.capture} />

        {review.verifiedIdentity ? (
          <section
            className="grid gap-1 rounded-xl border border-[#B7D8C2] bg-[#EEF7F1] p-4 text-sm"
            data-verified-identity=""
          >
            <h2 className="font-semibold text-[#16432A]">ครูยืนยันแล้ว</h2>
            <p>
              {review.verifiedIdentity.commonName} ·{" "}
              <i className="font-serif" lang="la">
                {review.verifiedIdentity.scientificName}
              </i>
            </p>
          </section>
        ) : null}

        {review.permissions.canDecide ? (
          <TeacherDecisionPanel
            onChanged={invalidate}
            online={online}
            review={review}
          />
        ) : null}

        <UnlockRequestsSection
          highlightRequestId={highlightRequestId}
          onChanged={invalidate}
          online={online}
          review={review}
        />

        {latest ? (
          <SubmissionCard latest submission={latest} />
        ) : (
          <p className="text-muted-foreground text-sm">ยังไม่มีฉบับที่ส่ง</p>
        )}

        {specimenRelations.length > 0 || speciesRelations.length > 0 ? (
          <RelatedSection
            observationId={observationId}
            online={online}
            specimen={specimenRelations}
            species={speciesRelations}
          />
        ) : null}

        <ReviewHistory review={review} />
        <ReportsList review={review} />

        {older.length > 0 ? (
          <section aria-labelledby="history-title" className="grid gap-3">
            <h2 className="font-semibold" id="history-title">
              ฉบับก่อนหน้า ({older.length})
            </h2>
            {older.map((submission) => (
              <details
                className="border-border bg-card rounded-xl border"
                key={submission.id}
              >
                <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium">
                  ส่งครั้งที่ {submission.submissionNumber} ·{" "}
                  <span className="ml-1 font-mono" suppressHydrationWarning>
                    {formatCaptureTime(submission.submittedAt)}
                  </span>
                </summary>
                <div className="border-t p-4">
                  <SubmissionCard latest={false} submission={submission} />
                </div>
              </details>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function CaptureSummary({ capture }: { capture: TeacherReview["capture"] }) {
  const located =
    capture.locationStatus === "captured" &&
    capture.lat !== null &&
    capture.lng !== null;
  return (
    <section
      aria-labelledby="teacher-capture-title"
      className={cn(
        "grid gap-1 rounded-xl border p-4 text-sm",
        located
          ? "border-border bg-card"
          : "border-dashed border-[#6B4204] bg-[#FFF6E5] text-[#5C3A04]",
      )}
      data-location-status={capture.locationStatus}
    >
      <h2 className="font-semibold" id="teacher-capture-title">
        {located ? "ตำแหน่งที่จับภาพ" : "⚑ ไม่มีพิกัด"}
      </h2>
      {located ? (
        <p className="font-mono">
          {formatCoordinate(capture.lat!)}, {formatCoordinate(capture.lng!)}
          {capture.accuracyM !== null
            ? ` · ±${Math.round(capture.accuracyM)} ม.`
            : ""}
        </p>
      ) : capture.unavailableReason ? (
        <p className="flex items-start gap-1.5">
          <Flag aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
          สาเหตุ:{" "}
          {LOCATION_UNAVAILABLE_REASON_LABELS[
            capture.unavailableReason as keyof typeof LOCATION_UNAVAILABLE_REASON_LABELS
          ] ?? capture.unavailableReason}
        </p>
      ) : null}
      <p className="text-muted-foreground">
        เวลาจับภาพ{" "}
        <span className="font-mono" suppressHydrationWarning>
          {formatCaptureTime(capture.capturedAt)}
        </span>
      </p>
    </section>
  );
}

function SubmissionCard({
  submission,
  latest,
}: {
  submission: Submission;
  latest: boolean;
}) {
  const traits = traitsOf(submission.verification);
  const counts = {
    value: traits.filter((trait) => !trait.status && trait.value).length,
    unsure: traits.filter((trait) => trait.status === "unsure").length,
    notVisible: traits.filter((trait) => trait.status === "not_visible").length,
  };
  return (
    <section
      aria-label={
        latest
          ? `ฉบับล่าสุด (ส่งครั้งที่ ${submission.submissionNumber})`
          : `ส่งครั้งที่ ${submission.submissionNumber}`
      }
      className={cn(
        "grid gap-3",
        latest && "border-border bg-card rounded-xl border p-4",
      )}
      data-submission-number={submission.submissionNumber}
    >
      {latest ? (
        <h2 className="font-semibold">
          ฉบับที่ส่ง · ครั้งที่ {submission.submissionNumber}
          <span
            className="text-muted-foreground ml-2 font-mono text-[13px] font-normal"
            suppressHydrationWarning
          >
            {formatCaptureTime(submission.submittedAt)}
          </span>
        </h2>
      ) : null}

      {submission.media.length > 0 ? (
        <ul
          aria-label="ภาพหลักฐาน"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {submission.media.map((media) => (
            <li
              className="border-border bg-muted overflow-hidden rounded-[10px] border"
              key={media.mediaId}
            >
              {media.signedUrl ? (
                // Signed private-bucket URLs expire; next/image would cache them.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`ภาพที่ ${media.position} · ${MEDIA_CATEGORY_LABELS[media.category]}`}
                  className="aspect-[3/4] w-full object-cover"
                  height={media.height}
                  loading="lazy"
                  src={media.signedUrl}
                  width={media.width}
                />
              ) : (
                <div className="text-muted-foreground grid aspect-[3/4] place-items-center p-2 text-center text-[13px]">
                  <ImageOff aria-hidden="true" className="size-5" />
                  โหลดภาพไม่ได้ ลองรีเฟรช
                </div>
              )}
              <p className="px-2 py-1 text-[13px] font-medium">
                {MEDIA_CATEGORY_LABELS[media.category]}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="grid gap-2 text-sm leading-6">
        <div>
          <dt className="text-muted-foreground text-[13px]">ชื่อ</dt>
          <dd className="break-words">
            {submission.commonName} ·{" "}
            <i className="font-serif" lang="la">
              {submission.scientificName}
            </i>
            <span className="text-muted-foreground ml-2 text-[13px]">
              (
              {submission.identitySource === "manual"
                ? "นักเรียนกรอกเอง"
                : "เลือกจาก AI"}
              )
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">เหตุผลประกอบ</dt>
          <dd className="break-words whitespace-pre-line">
            {submission.evidenceNote}
          </dd>
        </div>
        {submission.referenceNote ? (
          <div>
            <dt className="text-muted-foreground text-[13px]">แหล่งอ้างอิง</dt>
            <dd className="break-words">{submission.referenceNote}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground text-[13px]">
            การตรวจลักษณะของนักเรียน
          </dt>
          <dd>
            <p className="flex flex-wrap gap-x-3">
              <span>
                {TRAIT_MODE_LABELS.value} {counts.value}
              </span>
              <span>
                {TRAIT_MODE_LABELS.unsure} {counts.unsure}
              </span>
              <span>
                {TRAIT_MODE_LABELS.not_visible} {counts.notVisible}
              </span>
            </p>
            {traits.length > 0 ? (
              <ul className="mt-1 grid gap-0.5" data-traits="">
                {traits.map((trait) => (
                  <li key={trait.traitKey}>
                    <span className="font-medium">
                      {TRAIT_LABELS[trait.traitKey] ?? trait.traitKey}
                    </span>
                    {": "}
                    {trait.status === "unsure"
                      ? TRAIT_MODE_LABELS.unsure
                      : trait.status === "not_visible"
                        ? TRAIT_MODE_LABELS.not_visible
                        : `“${trait.value ?? ""}”`}
                    {trait.note ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {trait.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </div>
        {submission.sameSpeciesAcknowledged ? (
          <div>
            <dt className="text-muted-foreground text-[13px]">คำเตือน</dt>
            <dd>
              นักเรียนรับทราบว่าพบชนิดเดียวกันในรอบนี้ (
              {submission.sameSpeciesCount} รายการตอนส่ง)
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function RelatedSection({
  observationId,
  specimen,
  species,
  online,
}: {
  observationId: string;
  specimen: ObservationRelation[];
  species: ObservationRelation[];
  online: boolean;
}) {
  return (
    <section
      aria-labelledby="related-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <div>
        <h2 className="font-semibold" id="related-title">
          รายการที่เกี่ยวข้อง
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px] leading-5">
          ระบบไม่รวม ไม่ลบ และไม่ปฏิเสธรายการใดเอง
          ครูเป็นคนยืนยันว่าเป็นต้นเดียวกันหรือไม่
          ระยะทางอย่างเดียวไม่ใช่ข้อสรุป
        </p>
      </div>
      <ul className="grid gap-2">
        {[...specimen, ...species].map((relation) => (
          <RelationRow
            key={relation.relationId}
            observationId={observationId}
            online={online}
            relation={relation}
          />
        ))}
      </ul>
    </section>
  );
}

function RelationRow({
  observationId,
  relation,
  online,
}: {
  observationId: string;
  relation: ObservationRelation;
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Decision | null>(null);
  const mutation = useMutation({
    mutationFn: (decision: Decision) =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/related/${relation.relationId}/decision`,
        { decision, expectedDecision: relation.decision },
        decisionResponseSchema,
      ),
    onSettled: () => {
      setPending(null);
      void queryClient.invalidateQueries({
        queryKey: reviewQueryKeys.teacher(observationId),
      });
    },
  });
  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;
  const specimen = relation.relationshipType === "possible_same_specimen";
  const facts = [
    formatDistance(relation.distanceM),
    formatGap(relation.timeGapSeconds),
  ].filter(Boolean);

  return (
    <li
      className="border-border grid gap-2 rounded-[10px] border p-3 text-sm"
      data-relation={relation.relationshipType}
      data-relation-decision={relation.decision ?? "undecided"}
    >
      <p className="flex items-start gap-2 font-medium">
        {specimen ? (
          <Link2 aria-hidden="true" className="mt-1 size-4 shrink-0" />
        ) : (
          <Copy aria-hidden="true" className="mt-1 size-4 shrink-0" />
        )}
        <span>
          {specimen ? "อาจเป็นต้นเดียวกัน" : "ชนิดเดียวกัน"} ·{" "}
          {relation.otherStudentName ?? "นักเรียน"} ·{" "}
          {relation.otherCommonName ?? "—"}
          {relation.otherScientificName ? (
            <>
              {" "}
              <i className="font-serif" lang="la">
                {relation.otherScientificName}
              </i>
            </>
          ) : null}
        </span>
      </p>
      <p className="text-muted-foreground">
        {facts.length > 0 ? `${facts.join(" · ")} · ` : ""}
        <Link
          className="font-medium text-[#1F5C3A] underline underline-offset-2"
          href={`/teacher/reviews/${relation.otherObservationId}`}
        >
          เปิดรายการนั้น
        </Link>
      </p>
      {specimen ? (
        <>
          <p data-decision-state="">
            {relation.decision
              ? `ครูยืนยันแล้ว: ${DECISION_LABELS[relation.decision]}`
              : "ยังไม่ได้ยืนยัน"}
          </p>
          {relation.canDecide ? (
            <div className="grid grid-cols-2 gap-2">
              {(["same_specimen", "not_same_specimen"] as const).map(
                (decision) => (
                  <Button
                    aria-pressed={relation.decision === decision}
                    disabled={!online || mutation.isPending}
                    key={decision}
                    onClick={() => setPending(decision)}
                    variant={
                      relation.decision === decision ? "default" : "outline"
                    }
                  >
                    {decision === "same_specimen" ? (
                      <Link2 aria-hidden="true" className="size-4" />
                    ) : (
                      <Unlink aria-hidden="true" className="size-4" />
                    )}
                    {DECISION_LABELS[decision]}
                  </Button>
                ),
              )}
            </div>
          ) : null}
          {errorCode ? (
            <p className="text-[#8C1D18]" role="alert">
              {errorCode === "INVALID_STATUS_TRANSITION"
                ? "มีครูท่านอื่นเปลี่ยนการยืนยันแล้ว โหลดค่าล่าสุดแล้ว ตรวจอีกครั้ง"
                : errorCode === "NETWORK"
                  ? "บันทึกไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ ลองอีกครั้ง"
                  : presentReviewError(errorCode).title}
            </p>
          ) : null}
        </>
      ) : null}
      {pending ? (
        <ConfirmDecisionDialog
          busy={mutation.isPending}
          decision={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => mutation.mutate(pending)}
        />
      ) : null}
    </li>
  );
}

function ConfirmDecisionDialog({
  decision,
  busy,
  onConfirm,
  onCancel,
}: {
  decision: Decision;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card w-full max-w-[480px] rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
        }}
        role="alertdialog"
      >
        <h2 className="text-lg font-semibold" id={titleId}>
          ยืนยันว่าเป็น “{DECISION_LABELS[decision]}”?
        </h2>
        <p className="mt-1 text-sm leading-6" id={descriptionId}>
          บันทึกเป็นการตัดสินของครู ทั้งสองรายการยังอยู่ครบ ไม่มีการรวมหรือลบ
          และเปลี่ยนการยืนยันภายหลังได้
        </p>
        <div className="mt-4 grid gap-2">
          <Button disabled={busy} onClick={onConfirm} size="lg">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            ยืนยัน
          </Button>
          <button
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            ยกเลิก
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewDenied({
  code,
  onRetry,
  retrying,
}: {
  code: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation =
    code === "NETWORK"
      ? {
          title: "โหลดรายการพืชไม่สำเร็จ",
          description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
        }
      : presentReviewError(isReviewUiErrorCode(code) ? code : "FORBIDDEN");
  return (
    <section
      className="border-border bg-card rounded-xl border p-4"
      data-error-code={code}
      role="alert"
    >
      <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
      <h1 className="mt-2 font-semibold">{presentation.title}</h1>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {code === "FORBIDDEN"
          ? "รายการนี้ยังไม่ได้ส่ง หรือคุณไม่ได้เป็นครูของชั้นเรียนนี้"
          : presentation.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {code === "NETWORK" ? (
          <Button disabled={retrying} onClick={onRetry} variant="outline">
            <RefreshCw aria-hidden="true" className="size-4" />
            ลองใหม่
          </Button>
        ) : null}
        <Link
          className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          href="/teacher/classes"
        >
          กลับรายการชั้นเรียน
        </Link>
      </div>
    </section>
  );
}
