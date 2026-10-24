import bcrypt from "bcryptjs";
import { JenisKegiatan, Prisma, RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";
import { notificationService } from "./notification.service";

type FindAllPeriodeParams = {
  jenis?: JenisKegiatan;
  tahun?: number;
  isAktif?: boolean;
};

type CreatePeriodeInput = {
  nama: string;
  tahun: number;
  jenis: JenisKegiatan;
  tanggalMulai: string;
  tanggalSelesai: string;
  isAktif?: boolean;
};

type UpdatePeriodeInput = Partial<{
  nama: string;
  tahun: number;
  jenis: JenisKegiatan;
  tanggalMulai: string;
  tanggalSelesai: string;
  isAktif: boolean;
}>;

// ── Custom Errors ──────────────────────────────────────────────────────────────

class PeriodeNotFoundError extends Error {
  constructor() {
    super("Periode tidak ditemukan");
    this.name = "PeriodeNotFoundError";
  }
}

class InvalidPasswordError extends Error {
  constructor() {
    super("Password salah");
    this.name = "InvalidPasswordError";
  }
}

class DeletionRequestNotFoundError extends Error {
  constructor() {
    super("Permintaan penghapusan tidak ditemukan atau sudah tidak valid");
    this.name = "DeletionRequestNotFoundError";
  }
}

class SameRoleApprovalError extends Error {
  constructor() {
    super("Tidak dapat menyetujui permintaan yang Anda buat sendiri");
    this.name = "SameRoleApprovalError";
  }
}

class InsufficientRoleError extends Error {
  constructor() {
    super("Hanya admin atau ketua LPPM yang dapat melakukan tindakan ini");
    this.name = "InsufficientRoleError";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildPeriodeWhereInput(
  params: FindAllPeriodeParams,
): Prisma.PeriodeWhereInput {
  const { jenis, tahun, isAktif } = params;
  return {
    ...(jenis !== undefined && { jenis }),
    ...(tahun !== undefined && { tahun }),
    ...(isAktif !== undefined && { isAktif }),
  };
}

function toDate(value: string): Date {
  return new Date(value);
}

function mapCreatePeriodeData(
  data: CreatePeriodeInput,
): Prisma.PeriodeCreateInput {
  return {
    ...data,
    tanggalMulai: toDate(data.tanggalMulai),
    tanggalSelesai: toDate(data.tanggalSelesai),
  };
}

function mapUpdatePeriodeData(
  data: UpdatePeriodeInput,
): Prisma.PeriodeUpdateInput {
  return {
    ...data,
    ...(data.tanggalMulai !== undefined && {
      tanggalMulai: toDate(data.tanggalMulai),
    }),
    ...(data.tanggalSelesai !== undefined && {
      tanggalSelesai: toDate(data.tanggalSelesai),
    }),
  };
}

async function ensurePeriodeExists(id: number) {
  try {
    return await prisma.periode.findUniqueOrThrow({ where: { id } });
  } catch {
    throw new PeriodeNotFoundError();
  }
}

async function verifyUserPassword(userId: number, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new InvalidPasswordError();
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new InvalidPasswordError();
  return user;
}

function isAdminOrKetua(roles: RoleName[]): boolean {
  return roles.some((r) => r === RoleName.admin || r === RoleName.ketua_lppm);
}

function getOppositeRoleUsers(requesterRoles: RoleName[]) {
  // Jika requester adalah admin → cari ketua_lppm, dan sebaliknya
  const hasAdmin = requesterRoles.includes(RoleName.admin);
  const targetRole = hasAdmin ? RoleName.ketua_lppm : RoleName.admin;
  return targetRole;
}

async function findUsersWithRole(role: RoleName) {
  return prisma.user.findMany({
    where: {
      status: "approved",
      roles: { some: { role: { name: role } } },
    },
    select: { id: true, name: true },
  });
}

function makeDeletionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1); // 1 hari
  return d;
}

// ── CRUD biasa ─────────────────────────────────────────────────────────────────

async function findAll(params: FindAllPeriodeParams) {
  const where = buildPeriodeWhereInput(params);
  return prisma.periode.findMany({
    where,
    orderBy: [{ tahun: "desc" }, { createdAt: "desc" }],
  });
}

async function findById(id: number) {
  return ensurePeriodeExists(id);
}

async function create(data: CreatePeriodeInput) {
  return prisma.periode.create({ data: mapCreatePeriodeData(data) });
}

async function update(id: number, data: UpdatePeriodeInput) {
  await ensurePeriodeExists(id);
  return prisma.periode.update({
    where: { id },
    data: mapUpdatePeriodeData(data),
  });
}

// ── 2-Step Deletion ────────────────────────────────────────────────────────────

/**
 * Langkah 1: Requester (admin atau ketua) meminta penghapusan + verifikasi password.
 * Membuat record DeletionRequest lalu notifikasi ke role lawan.
 */
async function requestDelete(
  periodeId: number,
  requesterId: number,
  requesterRoles: RoleName[],
  password: string,
) {
  if (!isAdminOrKetua(requesterRoles)) throw new InsufficientRoleError();

  const periode = await ensurePeriodeExists(periodeId);
  await verifyUserPassword(requesterId, password);

  // Batalkan request lama yang masih pending untuk periode ini
  await prisma.periodeDeletionRequest.updateMany({
    where: { periodeId, status: "pending" },
    data: { status: "cancelled" },
  });

  const expiresAt = makeDeletionExpiry();
  const request = await prisma.periodeDeletionRequest.create({
    data: { periodeId, requesterId, expiresAt, status: "pending" },
  });

  // Notifikasi ke semua user dengan role lawan
  const targetRole = getOppositeRoleUsers(requesterRoles);
  const targetUsers = await findUsersWithRole(targetRole);

  await Promise.all(
    targetUsers.map((u) =>
      notificationService.create({
        userId: u.id,
        type: "deletion_request",
        judul: "Permintaan Penghapusan Periode",
        pesan: `Ada permintaan penghapusan periode "${periode.nama}". Masuk ke halaman Periode untuk menyetujui atau membatalkan.`,
        refId: request.id,
        refType: "PeriodeDeletionRequest",
      }),
    ),
  );

  return { requestId: request.id, expiresAt };
}

/**
 * Langkah 2: Approver (role berbeda dari requester) menyetujui + verifikasi password.
 * Jika valid → eksekusi delete periode.
 */
async function approveDelete(
  requestId: number,
  approverId: number,
  approverRoles: RoleName[],
  password: string,
) {
  if (!isAdminOrKetua(approverRoles)) throw new InsufficientRoleError();

  const request = await prisma.periodeDeletionRequest.findFirst({
    where: { id: requestId, status: "pending" },
    include: {
      periode: true,
      requester: { include: { roles: { include: { role: true } } } },
    },
  });

  if (!request || request.expiresAt < new Date()) {
    // Expire otomatis
    if (request) {
      await prisma.periodeDeletionRequest.update({
        where: { id: requestId },
        data: { status: "expired" },
      });
    }
    throw new DeletionRequestNotFoundError();
  }

  // Cek: approver tidak boleh sama dengan requester
  if (request.requesterId === approverId) throw new SameRoleApprovalError();

  // Cek: approver harus role yang berbeda dari requester
  const requesterRoles = request.requester.roles.map(
    (ur) => ur.role.name as RoleName,
  );
  const approverIsAdmin = approverRoles.includes(RoleName.admin);
  const requesterIsAdmin = requesterRoles.includes(RoleName.admin);
  if (approverIsAdmin === requesterIsAdmin) throw new SameRoleApprovalError();

  await verifyUserPassword(approverId, password);

  const periodeName = request.periode.nama;

  // Eksekusi dalam transaksi
  await prisma.$transaction([
    prisma.periodeDeletionRequest.update({
      where: { id: requestId },
      data: { status: "approved", approverId },
    }),
    prisma.periode.delete({ where: { id: request.periodeId } }),
  ]);

  // Notifikasi ke requester bahwa periode sudah terhapus
  await notificationService.create({
    userId: request.requesterId,
    type: "deletion_approved",
    judul: "Periode Berhasil Dihapus",
    pesan: `Periode "${periodeName}" telah dihapus setelah disetujui.`,
    refId: requestId,
    refType: "PeriodeDeletionRequest",
  });
}

/**
 * Ambil pending request aktif untuk suatu periode (untuk ditampilkan di UI).
 */
async function getPendingDeletionRequest(periodeId: number) {
  const request = await prisma.periodeDeletionRequest.findFirst({
    where: { periodeId, status: "pending", expiresAt: { gt: new Date() } },
    include: {
      requester: { select: { id: true, name: true } },
    },
  });
  return request;
}

/**
 * Batalkan request yang sedang pending (bisa oleh requester sendiri atau admin/ketua lain).
 */
async function cancelDeleteRequest(
  requestId: number,
  userId: number,
  userRoles: RoleName[],
) {
  if (!isAdminOrKetua(userRoles)) throw new InsufficientRoleError();

  const request = await prisma.periodeDeletionRequest.findFirst({
    where: { id: requestId, status: "pending" },
    include: { periode: true },
  });

  if (!request) throw new DeletionRequestNotFoundError();

  await prisma.periodeDeletionRequest.update({
    where: { id: requestId },
    data: { status: "cancelled" },
  });

  // Notifikasi ke requester jika yang batal bukan requester sendiri
  if (request.requesterId !== userId) {
    await notificationService.create({
      userId: request.requesterId,
      type: "deletion_cancelled",
      judul: "Permintaan Penghapusan Dibatalkan",
      pesan: `Permintaan penghapusan periode "${request.periode.nama}" telah dibatalkan.`,
      refId: requestId,
      refType: "PeriodeDeletionRequest",
    });
  }
}

export const periodeService = {
  findAll,
  findById,
  create,
  update,
  requestDelete,
  approveDelete,
  getPendingDeletionRequest,
  cancelDeleteRequest,
};
