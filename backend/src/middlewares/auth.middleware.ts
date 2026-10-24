import { Response, NextFunction } from "express";
import { RoleName } from "@prisma/client";
import { verifyAccessToken } from "../utils/jwt";
import { sendError } from "../utils/response";
import { AuthRequest } from "../types";
import { authAccessLogger } from "./authAccessLog.middleware";

const BEARER_PREFIX = "Bearer ";

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

function hasRequiredRole(
  userRoles: RoleName[],
  allowedRoles: RoleName[],
): boolean {
  return userRoles.some((role) => allowedRoles.includes(role));
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return sendError(res, "Unauthorized", 401);
  }

  try {
    const decodedUser = verifyAccessToken(token);
    req.user = decodedUser;

    // Dipanggil di sini (bukan sebagai middleware global terpisah) supaya
    // otomatis berlaku ke semua route yang pakai `authenticate`, tanpa
    // perlu menambahkan middleware baru satu-satu di tiap file route.
    authAccessLogger(req, res, () => {});

    return next();
  } catch {
    return sendError(res, "Token invalid or expired", 401);
  }
};

export const authorize = (...allowedRoles: RoleName[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }

    const isAuthorized = hasRequiredRole(req.user.roles, allowedRoles);

    if (!isAuthorized) {
      return sendError(res, "Forbidden: insufficient permissions", 403);
    }

    return next();
  };
};
