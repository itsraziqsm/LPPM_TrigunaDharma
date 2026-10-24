import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "../utils/logger";

const isProduction = process.env.NODE_ENV === "production";

const getErrorStatusCode = (
  err: Error & { statusCode?: number; status?: number },
  res: Response,
): number => {
  // err.statusCode / err.status: dipakai beberapa controller/service untuk
  // menandai error yang memang "kesalahan user" (400/401/403/404), bukan
  // error internal. Ada DUA nama properti berbeda dipakai di berbagai file
  // project ini (statusCode di laporan.controller.ts & proposal.controller.ts,
  // status di laporanHarian.service.ts) — keduanya dibaca di sini supaya
  // konsisten tanpa perlu menyeragamkan penamaan di semua file lama sekaligus.
  //
  // SEBELUM PERBAIKAN INI, tidak satu pun properti ini pernah dibaca oleh
  // handler global — semua error jatuh ke res.statusCode (selalu 200 saat
  // error terjadi, karena response belum sempat dikirim) sehingga fallback
  // ke 500 terlepas dari jenis errornya. Bug ini sudah ada sebelum
  // perubahan file-validation; diperbaiki di sini karena validasi upload
  // file yang baru bergantung pada perilaku yang benar.
  if (err.statusCode) {
    return err.statusCode;
  }

  if (err.status) {
    return err.status;
  }

  return res.statusCode !== 200 ? res.statusCode : 500;
};

const isPrismaUniqueConstraintError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
};

export const notFound = (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

export const errorHandler = (
  err: Error & { statusCode?: number; status?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  if (isPrismaUniqueConstraintError(err)) {
    return res.status(409).json({
      success: false,
      message: "Resource already exists",
    });
  }

  const statusCode = getErrorStatusCode(err, res);

  return res.status(statusCode).json({
    success: false,
    message: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
