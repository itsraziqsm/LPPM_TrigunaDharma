import { Response, NextFunction } from "express";
import { AuthRequest } from "../types";
import { logger } from "../utils/logger";

/**
 * Middleware ini HARUS dipasang setelah `authenticate`, karena bergantung
 * pada req.user yang baru terisi setelah token JWT divalidasi.
 *
 * Tujuannya beda dari accessLog.middleware.ts (morgan): morgan mencatat
 * SEMUA request mentah untuk GoAccess/analisis traffic umum, sedangkan
 * middleware ini mencatat "siapa" (userId) melakukan "apa" (method+path)
 * dari IP & device mana — untuk investigasi/audit saat butuh trace
 * aktivitas user tertentu, bukan traffic secara umum.
 */
export const authAccessLogger = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  if (req.user) {
    logger.info({
      type: "auth_access",
      userId: req.user.userId,
      email: req.user.email,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });
  }

  return next();
};
