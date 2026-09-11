import { z } from "zod";

import { groupStatusSchema } from "./contracts";
import { groupFailure, type GroupOperationResult } from "./create-result";
import { GROUP_CREATION_DENIAL_CODES } from "./errors";

const personSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
});

export const groupBoardGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: groupStatusSchema,
  creatorType: z.enum(["student", "teacher"]),
  leader: personSchema.nullable(),
  memberCount: z.number().int().nonnegative(),
  maximumSize: z.number().int().positive(),
  availableSeats: z.number().int().nonnegative(),
  meetsMinimumSize: z.boolean(),
  isAcceptingMembers: z.boolean(),
  members: z.array(personSchema.extend({ role: z.enum(["leader", "member"]) })),
  createdAt: z.string(),
});

export const cannotCreateReasonSchema = z.enum([
  ...GROUP_CREATION_DENIAL_CODES,
  "FORBIDDEN",
]);

export const boardPendingInvitationSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  groupName: z.string(),
  inviterName: z.string(),
  expiresAt: z.string(),
});

export const groupBoardSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  formationStatus: z.enum(["open", "closed"]),
  allowStudentGroups: z.boolean(),
  maximumGroups: z.number().int().positive(),
  currentGroupCount: z.number().int().nonnegative(),
  remainingGroupSlots: z.number().int().nonnegative(),
  minimumGroupSize: z.number().int().positive(),
  maximumGroupSize: z.number().int().positive(),
  viewer: z.object({
    userId: z.uuid(),
    role: z.enum(["student", "teacher"]),
    currentGroupId: z.uuid().nullable(),
    isLeader: z.boolean(),
    hasCreatedStudentGroup: z.boolean(),
    canCreateGroup: z.boolean(),
    cannotCreateReason: cannotCreateReasonSchema.nullable(),
    // Added in P4-02; older payloads without it read as no invitations.
    pendingInvitations: z.array(boardPendingInvitationSchema).default([]),
  }),
  groups: z.array(groupBoardGroupSchema),
  unassignedStudents: z.array(personSchema),
  refreshedAt: z.string(),
});

export type GroupBoard = z.infer<typeof groupBoardSchema>;
export type GroupBoardGroup = z.infer<typeof groupBoardGroupSchema>;
export type BoardPendingInvitation = z.infer<
  typeof boardPendingInvitationSchema
>;
export type CannotCreateReason = z.infer<typeof cannotCreateReasonSchema>;

export const groupQueryKeys = {
  all: ["groups"] as const,
  boards: () => [...groupQueryKeys.all, "board"] as const,
  board: (classId: string) => [...groupQueryKeys.boards(), classId] as const,
};

export function parseGroupBoard(
  value: unknown,
): GroupOperationResult<GroupBoard> {
  const parsed = groupBoardSchema.safeParse(value);
  return parsed.success ? { data: parsed.data } : groupFailure("FORBIDDEN");
}

/** Remaining invitation lifetime relative to the read model's refresh time. */
export function invitationTimeLeftLabel(
  expiresAt: string,
  referenceAt: string,
) {
  const remainingMs = Date.parse(expiresAt) - Date.parse(referenceAt);
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "หมดอายุแล้ว";
  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 1) return `หมดอายุใน ${hours} ชั่วโมง`;
  return `หมดอายุใน ${Math.max(1, Math.ceil(remainingMs / 60_000))} นาที`;
}
