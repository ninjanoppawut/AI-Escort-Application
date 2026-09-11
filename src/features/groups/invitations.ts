import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { groupStatusSchema } from "./contracts";
import { groupFailure, type GroupOperationResult } from "./create-result";
import {
  GROUP_INVITATION_DENIAL_CODES,
  isGroupInvitationDenialCode,
} from "./errors";

type Functions = Database["public"]["Functions"];

export const groupIdParamSchema = z.object({ id: z.uuid() }).strict();
export const invitationIdParamSchema = z.object({ id: z.uuid() }).strict();
export const classGroupParamSchema = z
  .object({ id: z.uuid(), groupId: z.uuid() })
  .strict();

export const sendGroupInvitationRequestSchema = z
  .object({ inviteeId: z.uuid() })
  .strict();

export type SendGroupInvitationRequest = z.infer<
  typeof sendGroupInvitationRequestSchema
>;

const personSchema = z.object({ id: z.uuid(), displayName: z.string() });

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
]);

export const eligibleClassmatesSchema = z.object({
  groupId: z.uuid(),
  classId: z.uuid(),
  groupName: z.string(),
  groupStatus: groupStatusSchema,
  maximumSize: z.number().int().positive(),
  memberCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
  canInvite: z.boolean(),
  cannotInviteReason: z
    .enum([
      "DESTINATION_GROUP_INVALID",
      "GROUP_LOCKED",
      "GROUP_FORMATION_CLOSED",
      "GROUP_FULL",
    ])
    .nullable(),
  classmates: z.array(
    personSchema.extend({
      state: z.enum(["eligible", "pending", "in_group"]),
      groupName: z.string().nullable(),
      invitationId: z.uuid().nullable(),
      expiresAt: z.string().nullable(),
    }),
  ),
  refreshedAt: z.string(),
});

export const groupDetailSchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: groupStatusSchema,
  creatorType: z.enum(["student", "teacher"]),
  createdAt: z.string(),
  formationStatus: z.enum(["open", "closed"]),
  minimumSize: z.number().int().positive(),
  maximumSize: z.number().int().positive(),
  memberCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
  meetsMinimumSize: z.boolean(),
  members: z.array(
    personSchema.extend({
      role: z.enum(["leader", "member"]),
      joinedAt: z.string(),
    }),
  ),
  pendingInvitations: z.array(
    z.object({
      id: z.uuid(),
      invitee: personSchema,
      createdAt: z.string(),
      expiresAt: z.string(),
    }),
  ),
  viewer: z.object({
    userId: z.uuid(),
    role: z.enum(["student", "teacher"]),
    isMember: z.boolean(),
    isLeader: z.boolean(),
  }),
  refreshedAt: z.string(),
});

export const groupInvitationDetailSchema = z.object({
  id: z.uuid(),
  status: invitationStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  respondedAt: z.string().nullable(),
  classId: z.uuid(),
  className: z.string(),
  group: z.object({
    id: z.uuid(),
    name: z.string(),
    status: groupStatusSchema,
    leader: personSchema.nullable(),
    members: z.array(
      personSchema.extend({ role: z.enum(["leader", "member"]) }),
    ),
    memberCount: z.number().int().nonnegative(),
    maximumSize: z.number().int().positive(),
    availableSeats: z.number().int().nonnegative(),
  }),
  inviter: personSchema.nullable(),
  viewer: z.object({
    isInvitee: z.boolean(),
    canRespond: z.boolean(),
    cannotRespondReason: z
      .enum([...GROUP_INVITATION_DENIAL_CODES, "FORBIDDEN"])
      .nullable(),
  }),
  refreshedAt: z.string(),
});

export type EligibleClassmates = z.infer<typeof eligibleClassmatesSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type GroupInvitationDetail = z.infer<typeof groupInvitationDetailSchema>;

export const invitationQueryKeys = {
  groupDetail: (groupId: string) => ["groups", "detail", groupId] as const,
  candidates: (groupId: string) => ["groups", "candidates", groupId] as const,
  invitation: (invitationId: string) =>
    ["groups", "invitation", invitationId] as const,
};

export function parseReadModel<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): GroupOperationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(value);
  return parsed.success ? { data: parsed.data } : groupFailure("FORBIDDEN");
}

type SendRow = Functions["send_group_invitation"]["Returns"][number];
type CancelRow = Functions["cancel_group_invitation"]["Returns"][number];
type AcceptRow = Functions["accept_group_invitation"]["Returns"][number];
type DeclineRow = Functions["decline_group_invitation"]["Returns"][number];

export interface SendGroupInvitationResult {
  outcome: "sent" | "already_pending";
  invitationId: string;
  groupId: string;
  inviteeId: string;
  expiresAt: string;
  availableSeats: number;
}

export interface InvitationStatusResult {
  outcome: "cancelled" | "declined";
  invitationId: string;
  groupId: string;
  classId: string;
}

export interface AcceptGroupInvitationResult {
  outcome: "accepted";
  invitationId: string;
  groupId: string;
  classId: string;
  membershipId: string;
  memberCount: number;
  maximumSize: number;
}

function denial(row: { error_code: string | null }, details = {}) {
  return isGroupInvitationDenialCode(row.error_code)
    ? groupFailure(row.error_code, details)
    : groupFailure("FORBIDDEN");
}

export function interpretSendRow(
  row: SendRow | undefined,
): GroupOperationResult<SendGroupInvitationResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return denial(row, { availableSeats: row.available_seats });
  }
  if (
    (row.outcome !== "sent" && row.outcome !== "already_pending") ||
    !row.invitation_id ||
    !row.expires_at
  ) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: row.outcome,
      invitationId: row.invitation_id,
      groupId: row.group_id,
      inviteeId: row.invitee_id,
      expiresAt: row.expires_at,
      availableSeats: row.available_seats,
    },
  };
}

export function interpretStatusRow(
  row: CancelRow | DeclineRow | undefined,
  successOutcome: "cancelled" | "declined",
): GroupOperationResult<InvitationStatusResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== successOutcome) return groupFailure("FORBIDDEN");
  return {
    data: {
      outcome: successOutcome,
      invitationId: row.invitation_id,
      groupId: row.group_id,
      classId: row.class_id,
    },
  };
}

export function interpretAcceptRow(
  row: AcceptRow | undefined,
): GroupOperationResult<AcceptGroupInvitationResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return denial(row, {
      memberCount: row.member_count,
      maximumSize: row.maximum_size,
    });
  }
  if (row.outcome !== "accepted" || !row.membership_id) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "accepted",
      invitationId: row.invitation_id,
      groupId: row.group_id,
      classId: row.class_id,
      membershipId: row.membership_id,
      memberCount: row.member_count,
      maximumSize: row.maximum_size,
    },
  };
}
