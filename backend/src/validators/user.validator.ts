import { z } from "zod";
import { RoleName, UserStatus } from "@prisma/client";

/**
 * ==================================================
 * REUSABLE FIELD SCHEMAS
 * ==================================================
 * Tujuan:
 * - Mengurangi duplikasi
 * - Menjaga konsistensi validasi
 * - Tetap tidak mengubah behavior existing
 */

const emailSchema = z.string().email();
const loginPasswordSchema = z.string().min(6);
const securePasswordSchema = z.string().min(8);
const nameSchema = z.string().min(2);
const nonEmptyTokenSchema = z.string().min(1);

/**
 * ==================================================
 * AUTH SCHEMAS
 * ==================================================
 */

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerDosenSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  fullName: z.string().optional(),
  password: securePasswordSchema,
  nidn: z.string().optional(),
  tempatLahir: z.string().optional(),
  // Dipertahankan apa adanya agar tidak mengubah behavior existing API
  tanggalLahir: z.string().datetime().optional(),
  institusi: z.string().optional(),
  programStudi: z.string().optional(),
  alamat: z.string().optional(),
  kontak: z.string().optional(),
});

export const registerMahasiswaSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  fullName: z.string().optional(),
  password: securePasswordSchema,
  nim: z.string().optional(),
  prodi: z.string().optional(),
  noHp: z.string().optional(),
  alamat: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: nonEmptyTokenSchema,
});

export const logoutSchema = z.object({
  refreshToken: nonEmptyTokenSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: nonEmptyTokenSchema,
  newPassword: securePasswordSchema,
});

export const changePasswordSchema = z.object({
  oldPassword: loginPasswordSchema,
  newPassword: securePasswordSchema,
});

/**
 * ==================================================
 * USER MANAGEMENT SCHEMAS
 * ==================================================
 */

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});

export const assignRoleSchema = z.object({
  roles: z.array(z.nativeEnum(RoleName)).min(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  role: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

/**
 * ==================================================
 * EXPORTED TYPES
 * ==================================================
 * Gunakan type ini di controller/service agar sinkron
 * dengan schema yang tervalidasi.
 */

export type LoginInput = z.input<typeof loginSchema>;
export type LoginPayload = z.infer<typeof loginSchema>;

export type RegisterDosenInput = z.input<typeof registerDosenSchema>;
export type RegisterDosenPayload = z.infer<typeof registerDosenSchema>;

export type RegisterMahasiswaInput = z.input<typeof registerMahasiswaSchema>;
export type RegisterMahasiswaPayload = z.infer<typeof registerMahasiswaSchema>;

export type RefreshTokenInput = z.input<typeof refreshTokenSchema>;
export type RefreshTokenPayload = z.infer<typeof refreshTokenSchema>;

export type LogoutInput = z.input<typeof logoutSchema>;
export type LogoutPayload = z.infer<typeof logoutSchema>;

export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordSchema>;

export type UpdateUserStatusInput = z.input<typeof updateUserStatusSchema>;
export type UpdateUserStatusPayload = z.infer<typeof updateUserStatusSchema>;

export type AssignRoleInput = z.input<typeof assignRoleSchema>;
export type AssignRolePayload = z.infer<typeof assignRoleSchema>;

export type PaginationInput = z.input<typeof paginationSchema>;
export type PaginationPayload = z.infer<typeof paginationSchema>;

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;
