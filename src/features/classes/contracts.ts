import { z } from "zod";

const requiredText = (max: number) =>
  z.string().trim().min(1, "Required").max(max);

const optionalText = (max: number) =>
  z
    .preprocess(
      (value) => (value === null ? undefined : value),
      z.string().trim().max(max).optional(),
    )
    .transform((value) => (value ? value : null));

export const formationStatusSchema = z.enum(["open", "closed"]);

export const classGroupSettingsSchema = z
  .object({
    minimumSize: z.coerce.number().int().min(1).max(20),
    maximumSize: z.coerce.number().int().min(1).max(20),
    maximumGroups: z.coerce.number().int().min(1).max(50),
    allowStudentGroups: z.boolean(),
    formationStatus: formationStatusSchema,
  })
  .strict()
  .refine((value) => value.maximumSize >= value.minimumSize, {
    path: ["maximumSize"],
    message: "Maximum size must be at least the minimum size.",
  });

export const createClassRequestSchema = z
  .object({
    schoolId: z.uuid(),
    name: requiredText(120),
    subject: optionalText(120),
    academicYear: optionalText(16),
    semester: optionalText(24),
    description: optionalText(1000),
    groupSettings: classGroupSettingsSchema,
  })
  .strict();

export const updateClassSettingsRequestSchema = classGroupSettingsSchema;

export const issueClassInviteRequestSchema = z
  .object({
    expiresAt: z.iso.datetime().nullable().optional(),
    maxUses: z.coerce.number().int().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => !value.expiresAt || Date.parse(value.expiresAt) > Date.now(),
    { path: ["expiresAt"], message: "Expiry must be in the future." },
  );

export const classIdParamSchema = z.object({ id: z.uuid() }).strict();
export const inviteIdParamSchema = z.object({ inviteId: z.uuid() }).strict();
export const joinTokenParamSchema = z.object({
  token: z.string().trim().min(1),
});

export const classMemberListQuerySchema = z
  .object({
    role: z.enum(["student", "teacher"]).optional(),
    status: z.enum(["active", "left"]).default("active"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

const inviteCodeSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/)
  .transform((value) => value.toUpperCase());

const inviteTokenSchema = z.string().trim().min(16).max(256);

export const joinClassRequestSchema = z
  .object({
    inviteCode: inviteCodeSchema.optional(),
    token: inviteTokenSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.inviteCode) !== Boolean(value.token), {
    message: "Provide either inviteCode or token.",
  });

export type CreateClassRequest = z.infer<typeof createClassRequestSchema>;
export type CreateClassFormValues = z.input<typeof createClassRequestSchema>;
export type ClassGroupSettings = z.infer<typeof classGroupSettingsSchema>;
export type ClassGroupSettingsFormValues = z.input<
  typeof classGroupSettingsSchema
>;
export type IssueClassInviteRequest = z.infer<
  typeof issueClassInviteRequestSchema
>;
export type IssueClassInviteFormValues = z.input<
  typeof issueClassInviteRequestSchema
>;
export type JoinClassRequest = z.infer<typeof joinClassRequestSchema>;
export type ClassMemberListQuery = z.infer<typeof classMemberListQuerySchema>;

export interface AuthorizedClassSummary {
  id: string;
  class_id: string;
  school_id: string;
  school_name: string;
  name: string;
  subject: string | null;
  academic_year: string | null;
  semester: string | null;
  description: string | null;
  min_group_size: number;
  max_group_size: number;
  maximum_groups: number;
  allow_student_groups: boolean;
  group_formation_status: "open" | "closed";
  status: "active" | "archived";
  caller_role: "student" | "teacher";
  active_member_count: number;
  created_at: string;
}

export interface ClassMemberSummary {
  id: string;
  member_id: string;
  class_id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  role: "student" | "teacher";
  status: "active" | "left";
  joined_at: string;
  left_at: string | null;
  current_group_id: string | null;
  current_group_name: string | null;
}

export interface ClassMemberPage {
  items: ClassMemberSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}
