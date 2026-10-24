import { UserStatus } from "@prisma/client";
import { userService } from "../user.service";
import { prisma } from "../../config/prisma";

// Prisma di-mock total supaya test ini tidak pernah menyentuh database
// beneran — kita cuma mau tes LOGIC di service, bukan Prisma itu sendiri.
jest.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Cast manual karena mock di atas cuma implement sebagian kecil dari
// PrismaClient (cukup method yang benar-benar dipakai userService).
const mockedUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
};

describe("userService.findById", () => {
  it("mengembalikan user kalau ditemukan", async () => {
    mockedUser.findUnique.mockResolvedValue({
      id: 1,
      email: "dosen@example.com",
      name: "Budi Santoso",
    });

    const user = await userService.findById(1);

    expect(user.email).toBe("dosen@example.com");
    expect(mockedUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  it("throw 'User not found' kalau user tidak ada", async () => {
    mockedUser.findUnique.mockResolvedValue(null);

    await expect(userService.findById(999)).rejects.toThrow("User not found");
  });
});

describe("userService.updateStatus", () => {
  it("throw duluan sebelum sempat update kalau user tidak ada", async () => {
    mockedUser.findUnique.mockResolvedValue(null);

    await expect(
      userService.updateStatus(999, UserStatus.approved),
    ).rejects.toThrow("User not found");

    // Ini yang penting: pastikan update TIDAK terpanggil sama sekali
    // begitu ensureUserExists() sudah throw duluan.
    expect(mockedUser.update).not.toHaveBeenCalled();
  });

  it("update status kalau user ada", async () => {
    mockedUser.findUnique.mockResolvedValue({ id: 1 });
    mockedUser.update.mockResolvedValue({
      id: 1,
      name: "Budi Santoso",
      email: "dosen@example.com",
      status: UserStatus.approved,
    });

    const result = await userService.updateStatus(1, UserStatus.approved);

    expect(result.status).toBe(UserStatus.approved);
    expect(mockedUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: UserStatus.approved },
      }),
    );
  });
});
