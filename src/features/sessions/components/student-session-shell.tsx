"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock3,
  Crown,
  Flag,
  ListStart,
  Loader2,
  LocateFixed,
  LocateOff,
  MapPinOff,
  Navigation,
  Pause,
  RefreshCw,
  ShieldAlert,
  UserRound,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  activityErrorCodeOf,
  fetchActivityJson,
  presentActivityError,
  type ActivityClientErrorCode,
} from "@/features/activities/client/request";
import { SchematicPreview } from "@/features/activities/components/schematic-preview";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { SessionObservationsPanel } from "@/features/observations/components/session-observations-panel";
import { cn } from "@/lib/utils";

import {
  FIELD_LOCATION_NOTICE,
  useFieldNoticeAcknowledgement,
} from "../client/field-notice";
import {
  sessionParticipantViewSchema,
  sessionQueryKeys,
  type SessionParticipantView,
} from "../contracts";
import {
  useLocationPublisher,
  type LocationPublisherState,
} from "../live-location/client/use-location-publisher";
import { accuracyLabel, studentSessionPhase } from "../live-view";
import type { StudentSessionPhase } from "../live-view";
import { SessionFreshness, SESSION_REALTIME_LABELS } from "./session-freshness";
import { SessionGroupStatusBadge } from "./session-group-status-badge";

/** Errors that mean the stale view must not stay on screen. */
const ACCESS_ERRORS: readonly ActivityClientErrorCode[] = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
];

function studentErrorPresentation(code: ActivityClientErrorCode) {
  if (code === "FORBIDDEN") {
    return {
      title: "คุณไม่ได้อยู่ในรอบสำรวจนี้",
      description:
        "เปิดได้เฉพาะนักเรียนที่มีรายชื่อในรอบสำรวจนี้ ถ้าคิดว่าไม่ถูกต้อง แจ้งครู",
    };
  }
  if (code === "NETWORK") {
    return {
      title: "โหลดรอบสำรวจไม่สำเร็จ",
      description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
    };
  }
  const presentation = presentActivityError(code);
  return { title: presentation.title, description: presentation.description };
}

function fetchParticipantView(sessionId: string) {
  return fetchActivityJson(
    `/api/sessions/${sessionId}/participant`,
    sessionParticipantViewSchema,
  );
}

export function StudentSessionShell({
  sessionId,
  userId,
  initialView,
  initialErrorCode,
}: {
  sessionId: string;
  userId: string;
  initialView: SessionParticipantView | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const online = useOnlineStatus();
  const viewQuery = useQuery({
    queryKey: sessionQueryKeys.participant(sessionId),
    queryFn: () => fetchParticipantView(sessionId),
    ...(initialView ? { initialData: initialView } : {}),
    // Group signals are the primary refresh; this slow fallback (D-041) only
    // covers a missed signal while the screen stays open.
    refetchInterval: (query) =>
      query.state.data?.session.status === "completed" ? false : 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const view = viewQuery.data;
  const errorCode: ActivityClientErrorCode | null = viewQuery.error
    ? activityErrorCodeOf(viewQuery.error)
    : !view
      ? initialErrorCode
      : null;

  if (!view || (errorCode && ACCESS_ERRORS.includes(errorCode))) {
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <div className="mx-auto grid max-w-[480px] gap-4">
          {errorCode ? (
            <SessionErrorPanel
              code={errorCode}
              onRetry={() => void viewQuery.refetch()}
              retrying={viewQuery.isFetching}
              sessionId={sessionId}
            />
          ) : (
            <p
              className="border-border bg-card flex items-center gap-2 rounded-xl border p-4 text-sm"
              role="status"
            >
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              กำลังโหลดรอบสำรวจ...
            </p>
          )}
        </div>
      </main>
    );
  }

  const phase = studentSessionPhase(view);
  const screen = {
    view,
    phase,
    userId,
    online,
    isFetching: viewQuery.isFetching,
    refreshFailed: viewQuery.isError,
    onRetry: () => void viewQuery.refetch(),
  };

  // A participant who left the session can no longer join the group topic;
  // mounting the publisher would only retry a refused join.
  if (phase === "participation_inactive") {
    return <StudentSessionScreen {...screen} publisher={null} />;
  }
  return <LiveStudentSessionScreen {...screen} sessionId={sessionId} />;
}

interface ScreenProps {
  view: SessionParticipantView;
  phase: StudentSessionPhase;
  userId: string;
  online: boolean;
  isFetching: boolean;
  refreshFailed: boolean;
  onRetry: () => void;
}

function LiveStudentSessionScreen(props: ScreenProps & { sessionId: string }) {
  const { sessionId, view, phase, userId, refreshFailed } = props;
  const [acknowledged, acknowledge] = useFieldNoticeAcknowledgement(sessionId);
  // Only a fresh authoritative view authorizes publishing (API §19): a failed
  // refresh keeps the page readable but stops sending.
  const publisher = useLocationPublisher({
    sessionId,
    userId,
    groupId: view.myGroup.groupId,
    canPublish:
      phase === "active" &&
      view.permissions.canPublishLocation &&
      !refreshFailed,
    viewRefreshedAt: view.refreshedAt,
    noticeAcknowledged: acknowledged,
  });

  return (
    <StudentSessionScreen
      {...props}
      acknowledged={acknowledged}
      onAcknowledge={acknowledge}
      publisher={publisher}
    />
  );
}

type LocationDisplay =
  | "notice"
  | "offline"
  | "checking"
  | "starting"
  | "sending"
  | "denied"
  | "unavailable"
  | "stopped";

function locationDisplay(
  acknowledged: boolean,
  online: boolean,
  canPublish: boolean,
  publisher: LocationPublisherState,
): LocationDisplay {
  if (!acknowledged) return "notice";
  if (!online) return "offline";
  if (publisher.status === "publishing") return "sending";
  if (publisher.status === "denied") return "denied";
  if (publisher.status === "unavailable") return "unavailable";
  if (publisher.status === "starting") return "starting";
  return canPublish ? "checking" : "stopped";
}

const LOCATION_COPY: Record<
  LocationDisplay,
  { chip: string; title: string; detail: string | null; icon: LucideIcon }
> = {
  notice: {
    chip: "ยังไม่แชร์ตำแหน่ง",
    title: "ยังไม่แชร์ตำแหน่ง",
    detail: "อ่านข้อมูลการแชร์ตำแหน่งด้านล่าง แล้วกดเริ่มเมื่อพร้อม",
    icon: LocateOff,
  },
  offline: {
    chip: "ออฟไลน์ · หยุดส่งตำแหน่ง",
    title: "ออฟไลน์ · หยุดส่งตำแหน่งชั่วคราว",
    detail:
      "จะส่งต่อเองเมื่อกลับมาออนไลน์ ระหว่างนี้ไม่มีการเก็บตำแหน่งไว้ในเครื่อง",
    icon: WifiOff,
  },
  checking: {
    chip: "กำลังตรวจสถานะรอบ",
    title: "กำลังตรวจสถานะรอบ...",
    detail: "จะส่งตำแหน่งต่อเมื่อได้สถานะล่าสุดจากระบบ",
    icon: RefreshCw,
  },
  starting: {
    chip: "กำลังหาตำแหน่ง",
    title: "กำลังหาตำแหน่ง...",
    detail: "ครั้งแรกอาจใช้เวลาสักครู่ ถ้าเบราว์เซอร์ถาม ให้กดอนุญาต",
    icon: LocateFixed,
  },
  sending: {
    chip: "ส่งตำแหน่งอยู่",
    title: "ส่งตำแหน่งให้ครูอยู่",
    detail: null,
    icon: LocateFixed,
  },
  denied: {
    chip: "ไม่ได้รับสิทธิ์ตำแหน่ง",
    title: "ไม่ได้รับสิทธิ์ตำแหน่ง",
    detail:
      "ครูยังไม่เห็นตำแหน่งของคุณ เปิดสิทธิ์ตำแหน่งให้เว็บนี้ แล้วโหลดหน้าใหม่",
    icon: MapPinOff,
  },
  unavailable: {
    chip: "หาตำแหน่งไม่ได้",
    title: "หาตำแหน่งไม่ได้",
    detail:
      "ขยับไปที่โล่ง ห่างจากหลังคาหรือต้นไม้ใหญ่ แล้วรอสักครู่ ระบบจะลองต่อเอง ถ้ายังไม่ได้ ให้แจ้งครู",
    icon: MapPinOff,
  },
  stopped: {
    chip: "หยุดส่งตำแหน่ง",
    title: "หยุดส่งตำแหน่งแล้ว",
    detail: "ยังส่งตำแหน่งไม่ได้ รอสถานะล่าสุดจากระบบ",
    icon: LocateOff,
  },
};

const PHASE_ICONS: Record<StudentSessionPhase, LucideIcon> = {
  waiting: Clock3,
  ready: ListStart,
  active: Navigation,
  paused: Pause,
  group_completed: Flag,
  session_completed: Flag,
  participation_inactive: ShieldAlert,
};

function phaseCopy(view: SessionParticipantView, phase: StudentSessionPhase) {
  const sessionPaused = view.session.status === "paused";
  const pausedNote = sessionPaused ? "ตอนนี้ครูพักรอบสำรวจชั่วคราว" : null;
  switch (phase) {
    case "waiting":
      return {
        title: `กลุ่มของคุณอยู่คิวที่ ${view.myGroup.queuePosition}`,
        lines: [
          view.groupsAhead > 0
            ? `รออีก ${view.groupsAhead} กลุ่มก่อนถึงคิวของคุณ`
            : "ใกล้ถึงคิวของคุณแล้ว",
          pausedNote,
          "ระหว่างรอ คุณดูเส้นทางและคำแนะนำได้ แต่ยังส่งตำแหน่งหรือบันทึกการสังเกตไม่ได้ จนกว่าครูจะเปิดกลุ่มของคุณ",
        ],
      };
    case "ready":
      return {
        title: "กลุ่มของคุณเป็นกลุ่มถัดไป",
        lines: [
          "เตรียมพร้อมสำรวจ ครูจะเปิดกลุ่มของคุณเมื่อกลุ่มก่อนหน้าสำรวจเสร็จ",
          pausedNote,
        ],
      };
    case "active":
      return {
        title: "กลุ่มของคุณกำลังสำรวจ",
        lines: ["เดินตามเส้นทางและจุดตรวจด้านล่าง"],
      };
    case "paused":
      return {
        title: "ครูพักรอบสำรวจชั่วคราว",
        lines: [
          "หยุดส่งตำแหน่งแล้ว รอครูเปิดรอบต่อ หน้านี้จะกลับเข้าโหมดสนามเอง",
        ],
      };
    case "group_completed":
      return {
        title: "กลุ่มของคุณสำรวจเสร็จแล้ว",
        lines: ["หยุดส่งตำแหน่งแล้ว รอบสำรวจยังดำเนินต่อสำหรับกลุ่มอื่น"],
      };
    case "session_completed":
      return {
        title: "รอบสำรวจนี้จบแล้ว",
        lines: ["ครูจบรอบสำรวจแล้ว หยุดส่งตำแหน่งแล้ว"],
      };
    case "participation_inactive":
      return {
        title: "คุณไม่ได้อยู่ในรอบสำรวจนี้แล้ว",
        lines: [
          "ส่งตำแหน่งหรือบันทึกการสังเกตในรอบนี้ไม่ได้ ถ้าคิดว่าไม่ถูกต้อง แจ้งครู",
        ],
      };
  }
}

function StudentSessionScreen({
  view,
  phase,
  userId,
  online,
  isFetching,
  refreshFailed,
  onRetry,
  publisher,
  acknowledged = false,
  onAcknowledge,
}: ScreenProps & {
  publisher: LocationPublisherState | null;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
}) {
  const fieldMode = phase === "active";
  const canPublish =
    fieldMode && view.permissions.canPublishLocation && !refreshFailed;
  const location =
    fieldMode && publisher
      ? locationDisplay(acknowledged, online, canPublish, publisher)
      : null;
  const copy = phaseCopy(view, phase);
  const PhaseIcon = PHASE_ICONS[phase];

  let bottom: ReactNode = null;
  if (location === "notice" && onAcknowledge) {
    bottom = <FieldLocationNotice onAcknowledge={onAcknowledge} />;
  } else if (phase === "waiting" || phase === "ready") {
    bottom = (
      <p
        className="border-border bg-card flex items-start gap-2 border-t p-4 text-sm leading-6"
        role="note"
      >
        <Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0" />
        รอครูเปิดกลุ่มของคุณ · หน้านี้จะเข้าโหมดสนามเองเมื่อถึงคิว
        และคุณจะได้รับแจ้งเตือน
      </p>
    );
  }

  return (
    <main
      className={cn(
        "bg-background flex min-h-dvh flex-col",
        fieldMode && "text-base",
      )}
      data-phase={phase}
    >
      {fieldMode && publisher && location ? (
        <FieldStatusStrip
          accuracyM={publisher.accuracyM}
          location={location}
          online={online}
          realtime={publisher.realtime}
        />
      ) : null}
      <div className="mx-auto grid w-full max-w-[480px] flex-1 content-start gap-4 px-4 pt-4 pb-6">
        <header className="flex items-center gap-3">
          <Link
            aria-label={fieldMode ? "ออกจากโหมดสนาม" : "กลับหน้าหลัก"}
            className={cn(
              "border-border bg-card grid shrink-0 place-items-center rounded-full border",
              fieldMode ? "size-14" : "size-11",
            )}
            href="/app"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {view.className} · {view.activity.title}
            </p>
            <h1 className="text-xl font-bold break-words">
              {view.session.title}
            </h1>
          </div>
        </header>

        <SessionFreshness
          isFetching={isFetching}
          realtime={publisher?.realtime}
          refreshedAt={view.refreshedAt}
        />

        {!online ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">ออฟไลน์อยู่</p>
              <p className="mt-0.5 leading-6">
                สถานะรอบอาจไม่เป็นปัจจุบัน
                {fieldMode ? " · หยุดส่งตำแหน่งจนกว่าจะกลับมาออนไลน์" : ""}
              </p>
            </div>
          </section>
        ) : null}

        {refreshFailed ? (
          <section
            className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            role="alert"
          >
            <span className="min-w-0 flex-1 leading-6">
              อัปเดตสถานะไม่สำเร็จ · กำลังแสดงสถานะล่าสุดที่โหลดได้
              {fieldMode ? " และหยุดส่งตำแหน่งไว้ก่อน" : ""}
            </span>
            <Button
              disabled={isFetching}
              onClick={onRetry}
              size="default"
              variant="outline"
            >
              ลองใหม่
            </Button>
          </section>
        ) : null}

        <section
          aria-labelledby="session-phase-title"
          className="border-border bg-card rounded-xl border p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <SessionGroupStatusBadge status={view.myGroup.status} />
            <span className="text-muted-foreground text-[13px]">
              กลุ่ม {view.myGroup.name}
            </span>
          </div>
          <h2
            className="mt-3 flex items-start gap-2 text-lg font-semibold"
            id="session-phase-title"
          >
            <PhaseIcon aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {copy.title}
          </h2>
          {copy.lines
            .filter((line): line is string => Boolean(line))
            .map((line) => (
              <p className="text-muted-foreground mt-1 leading-6" key={line}>
                {line}
              </p>
            ))}
        </section>

        {fieldMode && location && location !== "notice" ? (
          <FieldLocationPanel
            accuracyM={publisher?.accuracyM ?? null}
            location={location}
          />
        ) : null}

        {phase === "active" ||
        phase === "paused" ||
        phase === "waiting" ||
        phase === "ready" ? (
          <SessionObservationsPanel
            activityId={view.activity.id}
            sessionId={view.session.id}
            viewRefreshedAt={view.refreshedAt}
          />
        ) : null}

        <ActivityDetails view={view} />
        <GroupMembers userId={userId} view={view} />
      </div>
      {bottom ? (
        <div className="sticky bottom-0 z-10 mx-auto w-full max-w-[480px]">
          {bottom}
        </div>
      ) : null}
    </main>
  );
}

function FieldStatusStrip({
  location,
  accuracyM,
  online,
  realtime,
}: {
  location: LocationDisplay;
  accuracyM: number | null;
  online: boolean;
  realtime: LocationPublisherState["realtime"];
}) {
  const copy = LOCATION_COPY[location];
  const Icon = copy.icon;
  return (
    <div
      aria-label="สถานะโหมดสนาม"
      className="bg-forest text-[13px] leading-5 font-medium text-white"
      role="region"
    >
      <div className="mx-auto flex max-w-[480px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <span
          className="inline-flex items-center gap-1.5"
          data-location={location}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {copy.chip}
          {location === "sending" && accuracyM !== null ? (
            <span className="font-mono">{accuracyLabel(accuracyM)}</span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {online ? (
            <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          )}
          {online ? SESSION_REALTIME_LABELS[realtime] : "ออฟไลน์"}
        </span>
      </div>
    </div>
  );
}

function FieldLocationPanel({
  location,
  accuracyM,
}: {
  location: Exclude<LocationDisplay, "notice">;
  accuracyM: number | null;
}) {
  const copy = LOCATION_COPY[location];
  const Icon = copy.icon;
  const problem = location === "denied" || location === "unavailable";
  return (
    <section
      aria-labelledby="field-location-title"
      className={cn(
        "rounded-xl border p-4",
        problem
          ? "border-[#E8C58A] bg-[#FFF6E5] text-[#5C3A04]"
          : "border-border bg-card",
      )}
      data-location={location}
      role={problem ? "alert" : undefined}
    >
      <h2
        className="flex items-center gap-2 font-semibold"
        id="field-location-title"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {copy.title}
        {location === "sending" && accuracyM !== null ? (
          <span className="font-mono text-[15px]">
            · แม่นยำ {accuracyLabel(accuracyM)}
          </span>
        ) : null}
      </h2>
      {copy.detail ? <p className="mt-1 leading-6">{copy.detail}</p> : null}
      {location === "sending" ? (
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          เฉพาะครูของชั้นเรียนนี้ที่เห็นตำแหน่งของคุณ
        </p>
      ) : null}
      {location === "denied" ? (
        <>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6">
            <li>
              Chrome (Android): แตะไอคอนหน้าช่องที่อยู่เว็บ › สิทธิ์ › ตำแหน่ง ›
              อนุญาต
            </li>
            <li>
              Safari (iPhone): การตั้งค่า › ความเป็นส่วนตัวฯ › บริการหาตำแหน่ง ›
              เว็บไซต์ Safari › ขณะใช้งาน
            </li>
          </ul>
          <Button
            className="mt-3 w-full"
            onClick={() => window.location.reload()}
            size="lg"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            โหลดหน้าใหม่
          </Button>
        </>
      ) : null}
    </section>
  );
}

function FieldLocationNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <section
      aria-labelledby="field-notice-title"
      className="border-border bg-card rounded-t-[20px] border-t p-4 shadow-[0_-4px_20px_rgba(22,33,28,.14)]"
    >
      <h2
        className="flex items-center gap-2 text-lg font-semibold"
        id="field-notice-title"
      >
        <LocateFixed aria-hidden="true" className="size-5 shrink-0" />
        {FIELD_LOCATION_NOTICE.title}
      </h2>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 leading-6">
        {FIELD_LOCATION_NOTICE.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <Button className="mt-4 w-full" onClick={onAcknowledge} size="lg">
        {FIELD_LOCATION_NOTICE.action}
      </Button>
    </section>
  );
}

function ActivityDetails({ view }: { view: SessionParticipantView }) {
  const { geometry, activity } = view;
  const checkpoints = [...geometry.checkpoints].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );
  return (
    <section
      aria-labelledby="activity-heading"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <h2 className="font-semibold break-words" id="activity-heading">
        กิจกรรม: {activity.title}
      </h2>
      {activity.instructions ? (
        <div>
          <p className="text-muted-foreground text-[13px]">คำแนะนำจากครู</p>
          <p className="leading-6 break-words whitespace-pre-line">
            {activity.instructions}
          </p>
        </div>
      ) : null}
      <SchematicPreview
        boundary={geometry.boundary}
        checkpoints={checkpoints}
        className="mx-auto max-w-72"
        route={geometry.route}
      />
      {checkpoints.length ? (
        <ol aria-label="จุดตรวจ" className="grid gap-2 text-sm">
          {checkpoints.map((checkpoint) => (
            <li
              className="flex items-start gap-2"
              key={checkpoint.sequenceNumber}
            >
              <span
                aria-hidden="true"
                className="bg-forest grid size-6 shrink-0 place-items-center rounded-[4px] text-[12px] font-bold text-white"
              >
                {checkpoint.sequenceNumber}
              </span>
              <span className="min-w-0">
                <span className="block font-medium break-words">
                  จุดตรวจที่ {checkpoint.sequenceNumber} · {checkpoint.title}
                </span>
                {checkpoint.instructions ? (
                  <span className="text-muted-foreground block leading-6 break-words">
                    {checkpoint.instructions}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function GroupMembers({
  view,
  userId,
}: {
  view: SessionParticipantView;
  userId: string;
}) {
  return (
    <section
      aria-labelledby="group-members-heading"
      className="border-border bg-card rounded-xl border p-4"
    >
      <h2 className="font-semibold" id="group-members-heading">
        สมาชิกกลุ่ม {view.myGroup.name} ({view.myGroup.members.length} คน)
      </h2>
      <ul className="mt-2 grid gap-1.5 text-sm">
        {view.myGroup.members.map((member) => (
          <li className="flex items-center gap-2" key={member.userId}>
            {member.roleAtStart === "leader" ? (
              <Crown aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span className="break-words">{member.displayName}</span>
            {member.userId === userId ? (
              <span className="text-muted-foreground text-[13px]">(คุณ)</span>
            ) : null}
            {member.roleAtStart === "leader" ? (
              <span className="text-muted-foreground text-[13px]">
                หัวหน้ากลุ่ม
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionErrorPanel({
  code,
  sessionId,
  onRetry,
  retrying,
}: {
  code: ActivityClientErrorCode;
  sessionId: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation = studentErrorPresentation(code);
  const signIn = code === "AUTH_REQUIRED" || code === "EMAIL_NOT_CONFIRMED";
  const canRetry = !ACCESS_ERRORS.includes(code);
  return (
    <section
      className="border-border bg-card rounded-xl border p-4"
      role="alert"
    >
      <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
      <h1 className="mt-2 font-semibold">{presentation.title}</h1>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {presentation.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canRetry ? (
          <Button disabled={retrying} onClick={onRetry} variant="outline">
            {retrying ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            ลองใหม่
          </Button>
        ) : null}
        <Link
          className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          href={
            signIn
              ? `/auth/sign-in?${new URLSearchParams({ error: code, returnTo: `/field/sessions/${sessionId}` }).toString()}`
              : "/app"
          }
        >
          {signIn ? "ไปหน้าเข้าสู่ระบบ" : "กลับหน้าหลัก"}
        </Link>
      </div>
    </section>
  );
}
