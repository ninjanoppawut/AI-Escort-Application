import { z } from "zod";

export const GROUP_NAME_MAX_LENGTH = 120;
export const GROUP_DESCRIPTION_MAX_LENGTH = 1000;

export const groupStatusSchema = z.enum([
  "forming",
  "ready",
  "approved",
  "locked",
  "archived",
]);

export const createStudentGroupRequestSchema = z
  .object({
    classId: z.uuid(),
    name: z.string().trim().min(1, "Required").max(GROUP_NAME_MAX_LENGTH),
    description: z
      .preprocess(
        (value) => (value === null ? undefined : value),
        z.string().trim().max(GROUP_DESCRIPTION_MAX_LENGTH).optional(),
      )
      .transform((value) => (value ? value : null)),
  })
  .strict();

export type CreateStudentGroupRequest = z.infer<
  typeof createStudentGroupRequestSchema
>;
export type CreateStudentGroupFormValues = z.input<
  typeof createStudentGroupRequestSchema
>;
export type GroupStatus = z.infer<typeof groupStatusSchema>;

export interface GroupSlotSummary {
  currentGroupCount: number;
  maximumGroups: number;
  remainingGroupSlots: number;
}

export interface CreatedStudentGroup {
  group: {
    id: string;
    classId: string;
    name: string;
    description: string | null;
    status: GroupStatus;
    leaderId: string;
    createdAt: string;
  };
  slots: GroupSlotSummary;
}
