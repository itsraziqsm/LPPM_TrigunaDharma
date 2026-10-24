import bcrypt from "bcryptjs";
import crypto from "crypto";
import { RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { sendPasswordResetEmail } from "../utils/email";

type LoginUserWithRoles = {
  id: number;
  email: string;
  name: string;
  fullName: string | null;
  password: string;
  status: string;
  roles: Array<{
    role: {
      name: RoleName;
    };
  }>;
};

type RegisterDosenInput = {
  email: string;
  name: string;
  fullName?: string;
  password: string;
  nidn?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  institusi?: string;
  programStudi?: string;
  alamat?: string;
  kontak?: string;
};

type RegisterMahasiswaInput = {
  email: string;
  name: string;
  fullName?: string;
  password: string;
  nim?: string;
  prodi?: string;
  noHp?: string;
  alamat?: string;
};

const BCRYPT_SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

const DUMMY_PASSWORD_HASH =
  "$2a$12$dummyhashfordummycomparison00000000000000000000000000";

const userWithRolesInclude = {
  roles: {
    include: {
      role: true,
    },
  },
} as const;

const secureDelay = () =>
  new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));

const createExpiryDateFromNow = (days: number): Date => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
};

const getPasswordResetExpiryDate = (): Date =>
  new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

const getUserRoles = (user: LoginUserWithRoles): RoleName[] =>
  user.roles.map((userRole) => userRole.role.name);

const createTokenPayload = (user: LoginUserWithRoles) => ({
  userId: user.id,
  email: user.email,
  roles: getUserRoles(user),
});

const createAuthenticatedUserResponse = (user: LoginUserWithRoles) => ({
  id: user.id,
  name: user.name,
  fullName: user.fullName,
  email: user.email,
  status: user.status,
  roles: getUserRoles(user),
});

const findUserByEmailWithRoles = async (
  email: string,
): Promise<LoginUserWithRoles | null> => {
  return prisma.user.findUnique({
    where: { email },
    include: userWithRolesInclude,
  });
};

const findUserByIdWithRoles = async (
  userId: number,
): Promise<LoginUserWithRoles | null> => {
  return prisma.user.findUnique({
    where: { id: userId },
    include: userWithRolesInclude,
  });
};

const createRefreshTokenRecord = async (
  userId: number,
  token: string,
  expiresAt: Date,
) => {
  return prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
};

const revokeRefreshTokenById = async (id: number) => {
  return prisma.refreshToken.update({
    where: { id },
    data: { revoked: true },
  });
};

const revokeRefreshTokenByToken = async (token: string) => {
  return prisma.refreshToken.updateMany({
    where: { token },
    data: { revoked: true },
  });
};

const revokeAllActiveRefreshTokensByUserId = async (userId: number) => {
  return prisma.refreshToken.updateMany({
    where: {
      userId,
      revoked: false,
    },
    data: { revoked: true },
  });
};

const markAllActivePasswordResetTokensAsUsed = async (userId: number) => {
  return prisma.passwordResetToken.updateMany({
    where: {
      userId,
      used: false,
    },
    data: { used: true },
  });
};

const hashPassword = async (plainPassword: string): Promise<string> => {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
};

const comparePasswordSafely = async (
  plainPassword: string,
  hashedPassword?: string,
): Promise<boolean> => {
  if (hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  await bcrypt.compare(plainPassword, DUMMY_PASSWORD_HASH);
  return false;
};

const createTokenPairForUser = async (user: LoginUserWithRoles) => {
  const payload = createTokenPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenExpiresAt = createExpiryDateFromNow(
    REFRESH_TOKEN_EXPIRY_DAYS,
  );

  await createRefreshTokenRecord(user.id, refreshToken, refreshTokenExpiresAt);

  return {
    accessToken,
    refreshToken,
  };
};

const findRoleIdOrThrow = async (roleName: RoleName): Promise<number> => {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
  });

  return role.id;
};

export const authService = {
  async login(email: string, password: string) {
    const user = await findUserByEmailWithRoles(email);
    const isPasswordValid = await comparePasswordSafely(
      password,
      user?.password,
    );

    await secureDelay();

    if (!user || !isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    if (user.status !== "approved") {
      throw new Error("Account not approved yet");
    }

    const { accessToken, refreshToken } = await createTokenPairForUser(user);

    return {
      accessToken,
      refreshToken,
      user: createAuthenticatedUserResponse(user),
    };
  },

  // Refresh token rotation: revoke token lama, buat token baru
  async refreshToken(token: string) {
    const storedRefreshToken = await prisma.refreshToken.findUnique({
      where: { token },
    });

    if (
      !storedRefreshToken ||
      storedRefreshToken.revoked ||
      storedRefreshToken.expiresAt < new Date()
    ) {
      throw new Error("Refresh token invalid or expired");
    }

    const payload = verifyRefreshToken(token);
    const user = await findUserByIdWithRoles(payload.userId);

    if (!user) {
      throw new Error("User not found");
    }

    await revokeRefreshTokenById(storedRefreshToken.id);

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await createTokenPairForUser(user);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  },

  // Logout: revoke satu refresh token
  async logout(refreshToken: string) {
    await revokeRefreshTokenByToken(refreshToken);
  },

  // Logout semua device user
  async logoutAll(userId: number) {
    await revokeAllActiveRefreshTokensByUserId(userId);
  },

  // Forgot password: response tetap silent untuk cegah email enumeration
  async forgotPassword(email: string) {
    await secureDelay();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return;
    }

    await markAllActivePasswordResetTokensAsUsed(user.id);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = getPasswordResetExpiryDate();

    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt,
      },
    });

    await sendPasswordResetEmail(user.email, user.name, resetToken);
  },

  // Reset password + revoke semua refresh token
  async resetPassword(token: string, newPassword: string) {
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (
      !resetRecord ||
      resetRecord.used ||
      resetRecord.expiresAt < new Date()
    ) {
      throw new Error("Token invalid or expired");
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: resetRecord.userId },
        data: { revoked: true },
      }),
    ]);
  },

  // Register dosen: selalu pending, menunggu approval admin
  async registerDosen(data: RegisterDosenInput) {
    const hashedPassword = await hashPassword(data.password);
    const dosenRoleId = await findRoleIdOrThrow(RoleName.dosen);

    return prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        tanggalLahir: data.tanggalLahir
          ? new Date(data.tanggalLahir)
          : undefined,
        status: "pending",
        roles: {
          create: {
            roleId: dosenRoleId,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });
  },

  // Register mahasiswa: selalu pending, menunggu approval admin
  async registerMahasiswa(data: RegisterMahasiswaInput) {
    const hashedPassword = await hashPassword(data.password);
    const mahasiswaRoleId = await findRoleIdOrThrow(RoleName.mahasiswa);

    return prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        status: "pending",
        roles: {
          create: {
            roleId: mahasiswaRoleId,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });
  },
};
