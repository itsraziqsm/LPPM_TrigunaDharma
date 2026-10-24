import type { Request } from "express";
import type { RoleName } from "@prisma/client";

/**
 * Payload JWT yang disisipkan oleh auth middleware setelah token tervalidasi.
 * Tidak memuat data sensitif tambahan agar aman digunakan lintas controller/service.
 */
export interface JwtPayload {
  userId: number;
  email: string;
  roles: RoleName[];
}

/**
 * Request umum yang bisa saja belum memiliki user.
 * Cocok untuk middleware auth opsional atau endpoint campuran.
 */
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * Request yang dijamin sudah lolos middleware autentikasi.
 * Gunakan di controller/service yang memang mewajibkan user terautentikasi
 * agar null-check tidak berulang.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Metadata response untuk pagination/list endpoint.
 * Tetap opsional agar tidak mengubah struktur response endpoint yang tidak memakai paging.
 */
export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
}

/**
 * Wrapper response API standar.
 * Struktur dipertahankan agar tidak mengubah kontrak JSON output yang sudah ada.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: ApiResponseMeta;
}
