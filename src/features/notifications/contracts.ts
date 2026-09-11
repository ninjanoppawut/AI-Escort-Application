import { z } from "zod";

export const notificationLayouts = [
  "membership",
  "invitation",
  "group_status",
  "session_status",
  "observation_status",
  "request",
  "warning",
  "export",
] as const;

export const notificationTypeRegistry = {
  class_joined: {
    layout: "membership",
    icon: "School",
    copyKey: "notifications.class_joined",
    deepLinkTemplate: "/classes/{classId}",
  },
  student_joined_class: {
    layout: "membership",
    icon: "UserPlus",
    copyKey: "notifications.student_joined_class",
    deepLinkTemplate: "/teacher/classes/{classId}/members",
  },
  group_invitation_received: {
    layout: "invitation",
    icon: "MailPlus",
    copyKey: "notifications.group_invitation_received",
    deepLinkTemplate: "/group-invitations/{invitationId}",
  },
  group_invitation_accepted: {
    layout: "membership",
    icon: "UserRoundCheck",
    copyKey: "notifications.group_invitation_accepted",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_invitation_declined: {
    layout: "membership",
    icon: "UserRoundX",
    copyKey: "notifications.group_invitation_declined",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_invitation_cancelled: {
    layout: "invitation",
    icon: "MailX",
    copyKey: "notifications.group_invitation_cancelled",
    deepLinkTemplate: "/classes/{classId}/groups",
  },
  student_moved_group: {
    layout: "membership",
    icon: "ArrowRightLeft",
    copyKey: "notifications.student_moved_group",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  leadership_assigned: {
    layout: "membership",
    icon: "Crown",
    copyKey: "notifications.leadership_assigned",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  leadership_transferred: {
    layout: "membership",
    icon: "RefreshCw",
    copyKey: "notifications.leadership_transferred",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_minimum_reached: {
    layout: "group_status",
    icon: "UsersRound",
    copyKey: "notifications.group_minimum_reached",
    deepLinkTemplate: "/teacher/classes/{classId}/groups/{groupId}",
  },
  group_approval_requested: {
    layout: "request",
    icon: "ClipboardClock",
    copyKey: "notifications.group_approval_requested",
    deepLinkTemplate: "/teacher/classes/{classId}/groups/{groupId}",
  },
  group_approved: {
    layout: "group_status",
    icon: "BadgeCheck",
    copyKey: "notifications.group_approved",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_locked: {
    layout: "group_status",
    icon: "LockKeyhole",
    copyKey: "notifications.group_locked",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_unlocked: {
    layout: "group_status",
    icon: "LockOpen",
    copyKey: "notifications.group_unlocked",
    deepLinkTemplate: "/classes/{classId}/groups/{groupId}",
  },
  group_archived: {
    layout: "group_status",
    icon: "Archive",
    copyKey: "notifications.group_archived",
    deepLinkTemplate: "/classes/{classId}/groups",
  },
  group_deleted: {
    layout: "group_status",
    icon: "Trash2",
    copyKey: "notifications.group_deleted",
    deepLinkTemplate: "/classes/{classId}/groups",
  },
  session_group_next: {
    layout: "session_status",
    icon: "ListStart",
    copyKey: "notifications.session_group_next",
    deepLinkTemplate: "/activities/{activityId}/sessions/{sessionId}",
  },
  session_group_active: {
    layout: "session_status",
    icon: "Navigation",
    copyKey: "notifications.session_group_active",
    deepLinkTemplate: "/field/sessions/{sessionId}",
  },
  session_completed: {
    layout: "session_status",
    icon: "Flag",
    copyKey: "notifications.session_completed",
    deepLinkTemplate: "/sessions/{sessionId}/map",
  },
  observation_submitted: {
    layout: "observation_status",
    icon: "Send",
    copyKey: "notifications.observation_submitted",
    deepLinkTemplate: "/teacher/reviews/{observationId}",
  },
  observation_resubmitted: {
    layout: "observation_status",
    icon: "RefreshCw",
    copyKey: "notifications.observation_resubmitted",
    deepLinkTemplate: "/teacher/reviews/{observationId}",
  },
  observation_revision_requested: {
    layout: "observation_status",
    icon: "RotateCcw",
    copyKey: "notifications.observation_revision_requested",
    deepLinkTemplate: "/observations/{observationId}/revision",
  },
  revision_access_requested: {
    layout: "request",
    icon: "MessageSquarePlus",
    copyKey: "notifications.revision_access_requested",
    deepLinkTemplate:
      "/teacher/reviews/{observationId}/unlock-requests/{requestId}",
  },
  revision_access_granted: {
    layout: "request",
    icon: "LockOpen",
    copyKey: "notifications.revision_access_granted",
    deepLinkTemplate: "/observations/{observationId}/revision",
  },
  observation_verified: {
    layout: "observation_status",
    icon: "BadgeCheck",
    copyKey: "notifications.observation_verified",
    deepLinkTemplate: "/observations/{observationId}",
  },
  observation_unable_to_verify: {
    layout: "observation_status",
    icon: "CircleHelp",
    copyKey: "notifications.observation_unable_to_verify",
    deepLinkTemplate: "/observations/{observationId}",
  },
  observation_rejected: {
    layout: "observation_status",
    icon: "Ban",
    copyKey: "notifications.observation_rejected",
    deepLinkTemplate: "/observations/{observationId}",
  },
  same_species_warning: {
    layout: "warning",
    icon: "Copy",
    copyKey: "notifications.same_species_warning",
    deepLinkTemplate: "/teacher/reviews/{observationId}",
  },
  observation_issue_reported: {
    layout: "request",
    icon: "FlagTriangleRight",
    copyKey: "notifications.observation_issue_reported",
    deepLinkTemplate: "/teacher/reports/{reportId}",
  },
  location_session_warning: {
    layout: "warning",
    icon: "MapPinWarning",
    copyKey: "notifications.location_session_warning",
    deepLinkTemplate: "/teacher/sessions/{sessionId}/live",
  },
  export_ready: {
    layout: "export",
    icon: "Download",
    copyKey: "notifications.export_ready",
    deepLinkTemplate: "/teacher/exports/{exportId}",
  },
} as const satisfies Record<
  string,
  {
    layout: (typeof notificationLayouts)[number];
    icon: string;
    copyKey: `notifications.${string}`;
    deepLinkTemplate: `/${string}`;
  }
>;

export const notificationTypes = Object.keys(notificationTypeRegistry) as Array<
  keyof typeof notificationTypeRegistry
>;

export const notificationTypeSchema = z.enum(
  notificationTypes as [
    keyof typeof notificationTypeRegistry,
    ...Array<keyof typeof notificationTypeRegistry>,
  ],
);

export const notificationLayoutSchema = z.enum(notificationLayouts);

export const notificationListQuerySchema = z
  .object({
    status: z.enum(["all", "unread"]).default("all"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const notificationIdParamSchema = z
  .object({
    id: z.uuid(),
  })
  .strict();

export const notificationSignalSchema = z
  .object({
    type: z.literal("notification.created"),
    version: z.literal(1),
    notificationId: z.uuid(),
    recipientId: z.uuid(),
    changedAt: z.iso.datetime({ offset: true }),
  })
  .passthrough();

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationLayout = z.infer<typeof notificationLayoutSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationSignal = z.infer<typeof notificationSignalSchema>;

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  layout: NotificationLayout;
  icon: string;
  copyKey: `notifications.${string}`;
  title: string;
  message: string;
  payload: unknown;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface NotificationPage {
  items: NotificationSummary[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}
