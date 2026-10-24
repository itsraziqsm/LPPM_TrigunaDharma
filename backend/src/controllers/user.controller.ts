import { Response } from "express";
import { z } from "zod";
import { RoleName, UserStatus } from "@prisma/client";
import { userService } from "../services/user.service";
import { prisma } from "../config/prisma";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const getAllQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(15),
  search: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  role: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.nativeEnum(RoleName).optional(),
  ),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.nativeEnum(UserStatus).optional(),
  ),
});

const updateStatusBodySchema = z.object({
  status: z.nativeEnum(UserStatus),
});

const assignRolesBodySchema = z.object({
  roles: z.array(z.nativeEnum(RoleName)).min(1),
});

const changePasswordBodySchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string(),
});

const searchQuerySchema = z.object({
  q: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  role: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.nativeEnum(RoleName).optional(),
  ),
  limit: z.coerce.number().int().positive().default(50),
});

function parseUserIdParam(params: unknown) {
  return userIdParamSchema.parse(params);
}

function parseGetAllQuery(query: unknown) {
  return getAllQuerySchema.parse(query);
}

function parseUpdateStatusBody(body: unknown) {
  return updateStatusBodySchema.parse(body);
}

function parseAssignRolesBody(body: unknown) {
  return assignRolesBodySchema.parse(body);
}

function parseChangePasswordBody(body: unknown) {
  return changePasswordBodySchema.parse(body);
}

function parseSearchQuery(query: unknown) {
  return searchQuerySchema.parse(query);
}

export const userController = {
  async getAll(req: AuthRequest, res: Response) {
    const { page, limit, search, role, status } = parseGetAllQuery(req.query);

    const result = await userService.findAll({
      page,
      limit,
      search,
      role,
      status,
    });

    return sendSuccess(res, "Users fetched", result.users, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  },

  async getById(req: AuthRequest, res: Response) {
    const { id } = parseUserIdParam(req.params);

    const user = await userService.findById(id);
    return sendSuccess(res, "User fetched", user);
  },

  async updateStatus(req: AuthRequest, res: Response) {
    const { id } = parseUserIdParam(req.params);
    const { status } = parseUpdateStatusBody(req.body);

    const user = await userService.updateStatus(id, status);
    return sendSuccess(res, "Status updated", user);
  },

  async assignRoles(req: AuthRequest, res: Response) {
    const { id } = parseUserIdParam(req.params);
    const { roles } = parseAssignRolesBody(req.body);

    const user = await userService.assignRoles(id, roles);
    return sendSuccess(res, "Roles assigned", user);
  },

  async updateProfile(req: AuthRequest, res: Response) {
    const id = req.user!.userId;
    const user = await userService.updateProfile(id, req.body);

    return sendSuccess(res, "Profile updated", user);
  },

  async changePassword(req: AuthRequest, res: Response) {
    const { oldPassword, newPassword } = parseChangePasswordBody(req.body);

    await userService.changePassword(
      req.user!.userId,
      oldPassword,
      newPassword,
    );

    return sendSuccess(res, "Password changed successfully");
  },

  async deleteUser(req: AuthRequest, res: Response) {
    const { id } = parseUserIdParam(req.params);

    await userService.deleteUser(id);
    return sendSuccess(res, "User deleted");
  },

  async search(req: AuthRequest, res: Response) {
    const { q, role, limit } = parseSearchQuery(req.query);

    const users = await prisma.user.findMany({
      where: {
        status: "approved",
        roles: {
          some: {
            role: {
              name: role ? role : { in: [RoleName.dosen, RoleName.mahasiswa] },
            },
          },
        },
        ...(q && {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { fullName: { contains: q } },
            { nidn: { contains: q } },
            { nim: { contains: q } },
          ],
        }),
      },
      take: Math.min(limit, 200),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fullName: true,
        email: true,
        programStudi: true,
        prodi: true,
        nim: true,
        nidn: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return sendSuccess(res, "Users found", users);
  },
};
