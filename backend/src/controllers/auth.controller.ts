import { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { activityLogService } from "../services/activityLog.service";
import { sendSuccess, sendError } from "../utils/response";
import { AuthRequest } from "../types";
import { prisma } from "../config/prisma";

type CurrentUserResponse = {
  id: number;
  name: string | null;
  fullName: string | null;
  email: string;
  status: unknown;
  roles: string[];
  hasTugasan: boolean;
};

const getRequiredStringField = (
  req: Request,
  fieldName: string,
): string | undefined => {
  const value = req.body?.[fieldName];

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value;
};

const authProfileService = {
  async getCurrentUserProfile(
    userId: number,
  ): Promise<CurrentUserResponse | null> {
    const [user, tugasanCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      }),
      prisma.reviewerTugasan.count({
        where: { reviewerId: userId },
      }),
    ]);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      fullName: user.fullName,
      email: user.email,
      status: user.status,
      roles: user.roles.map((userRole) => userRole.role.name),
      hasTugasan: tugasanCount > 0,
    };
  },
};

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Dicatat di sini (controller), bukan di authService, karena "login berhasil"
    // adalah action level HTTP request — konsisten dengan pola action lain
    // (proposal.create, dll) yang juga dicatat setelah service call sukses.
    // ipAddress/userAgent terisi otomatis lewat requestContext, tidak perlu
    // dikirim manual.
    await activityLogService.log({
      userId: result.user.id,
      action: "LOGIN",
      detail: "Login berhasil",
    });

    return sendSuccess(res, "Login successful", result);
  },

  async refreshToken(req: Request, res: Response) {
    const refreshToken = getRequiredStringField(req, "refreshToken");

    if (!refreshToken) {
      return sendError(res, "Refresh token required", 400);
    }

    const result = await authService.refreshToken(refreshToken);

    return sendSuccess(res, "Token refreshed", result);
  },

  async logout(req: Request, res: Response) {
    const refreshToken = getRequiredStringField(req, "refreshToken");

    if (!refreshToken) {
      return sendError(res, "Refresh token required", 400);
    }

    await authService.logout(refreshToken);

    return sendSuccess(res, "Logged out successfully");
  },

  async logoutAll(req: AuthRequest, res: Response) {
    await authService.logoutAll(req.user!.userId);

    return sendSuccess(res, "Logged out from all devices");
  },

  async registerDosen(req: Request, res: Response) {
    const user = await authService.registerDosen(req.body);

    return sendSuccess(
      res,
      "Registration submitted, awaiting approval",
      user,
      201,
    );
  },

  async registerMahasiswa(req: Request, res: Response) {
    const user = await authService.registerMahasiswa(req.body);

    return sendSuccess(
      res,
      "Registration submitted, awaiting approval",
      user,
      201,
    );
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body.email);

    return sendSuccess(
      res,
      "If your email is registered, you will receive a reset link",
    );
  },

  async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    await authService.resetPassword(token, newPassword);

    return sendSuccess(res, "Password reset successfully");
  },

  async me(req: AuthRequest, res: Response) {
    const currentUser = await authProfileService.getCurrentUserProfile(
      req.user!.userId,
    );

    if (!currentUser) {
      return sendError(res, "User not found", 404);
    }

    return sendSuccess(res, "Current user", currentUser);
  },
};
