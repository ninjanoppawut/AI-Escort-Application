import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .pipe(z.email("กรุณากรอกอีเมลให้ถูกต้อง"))
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(10, "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร")
  .max(128, "รหัสผ่านต้องไม่เกิน 128 ตัวอักษร");

const returnToSchema = z.string().max(512).optional();

export const signUpRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    returnTo: returnToSchema,
  })
  .strict();

export const signInRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "กรุณากรอกรหัสผ่าน").max(128),
    returnTo: returnToSchema,
  })
  .strict();

export const emailRequestSchema = z
  .object({ email: emailSchema, returnTo: returnToSchema })
  .strict();

export const updatePasswordRequestSchema = z
  .object({ password: passwordSchema })
  .strict();

export const signUpFormSchema = signUpRequestSchema
  .extend({ passwordConfirmation: z.string() })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "รหัสผ่านทั้งสองช่องต้องตรงกัน",
    path: ["passwordConfirmation"],
  });

export const updatePasswordFormSchema = updatePasswordRequestSchema
  .extend({ passwordConfirmation: z.string() })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "รหัสผ่านทั้งสองช่องต้องตรงกัน",
    path: ["passwordConfirmation"],
  });

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;
export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type EmailRequest = z.infer<typeof emailRequestSchema>;
export type UpdatePasswordRequest = z.infer<typeof updatePasswordRequestSchema>;
