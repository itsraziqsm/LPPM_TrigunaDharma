import bcrypt from "bcryptjs";
import { Prisma, RoleName, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

const PASSWORD_SALT_ROUNDS = 12;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  fullName: true,
  status: true,
  nidn: true,
  nim: true,
  prodi: true,
  programStudi: true,
  institusi: true,
  kontak: true,
  noHp: true,
  alamat: true,
  tempatLahir: true,
  tanggalLahir: true,
  createdAt: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type FindAllUsersParams = {
  page: number;
  limit: number;
  search?: string;
  role?: RoleName;
  status?: UserStatus;
};

type UpdateProfilePayload = Partial<{
  name: string;
  fullName: string;
  alamat: string;
  kontak: string;
  noHp: string;
  institusi: string;
  programStudi: string;
  prodi: string;
  tempatLahir: string;
  tanggalLahir: string;
}>;

class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

function buildUserListWhereInput(
  params: Pick<FindAllUsersParams, "search" | "role" | "status">,
): Prisma.UserWhereInput {
  const { search, role, status } = params;

  return {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { fullName: { contains: search } },
          ],
        }
      : {}),
    ...(role
      ? {
          roles: {
            some: {
              role: {
                name: role,
              },
            },
          },
        }
      : {}),
  };
}

async function ensureUserExists(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return user;
}

function buildProfileUpdateData(
  data: UpdateProfilePayload,
): Prisma.UserUpdateInput {
  return {
    ...data,
    tanggalLahir: data.tanggalLahir ? new Date(data.tanggalLahir) : undefined,
  };
}

async function getValidRoleRecords(roleNames: RoleName[]) {
  const roleRecords = await prisma.role.findMany({
    where: {
      name: {
        in: roleNames,
      },
    },
  });

  return roleRecords;
}

export const userService = {
  async findAll(params: FindAllUsersParams) {
    const { page, limit, search, role, status } = params;
    const skip = (page - 1) * limit;

    const where = buildUserListWhereInput({ search, role, status });

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: USER_SELECT,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
    };
  },

  async findById(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  },

  async updateStatus(id: number, status: UserStatus) {
    await ensureUserExists(id);

    return prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
      },
    });
  },

  async assignRoles(id: number, roles: RoleName[]) {
    await ensureUserExists(id);

    const roleRecords = await getValidRoleRecords(roles);

    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: { userId: id },
      }),
      prisma.userRole.createMany({
        data: roleRecords.map((role) => ({
          userId: id,
          roleId: role.id,
        })),
      }),
    ]);

    return prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
  },

  async updateProfile(id: number, data: UpdateProfilePayload) {
    await ensureUserExists(id);

    return prisma.user.update({
      where: { id },
      data: buildProfileUpdateData(data),
      select: USER_SELECT,
    });
  },

  async changePassword(id: number, oldPassword: string, newPassword: string) {
    const user = await ensureUserExists(id);

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      throw new BadRequestError("Old password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  },

  async deleteUser(id: number) {
    await prisma.user.findUniqueOrThrow({
      where: { id },
    });

    await prisma.user.delete({
      where: { id },
    });
  },
};
