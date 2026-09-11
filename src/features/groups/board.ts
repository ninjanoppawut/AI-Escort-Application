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
  }),
  groups: z.array(groupBoardGroupSchema),
  unassignedStudents: z.array(personSchema),
  refreshedAt: z.string(),
});

export type GroupBoard = z.infer<typeof groupBoardSchema>;
export type GroupBoardGroup = z.infer<typeof groupBoardGroupSchema>;
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
