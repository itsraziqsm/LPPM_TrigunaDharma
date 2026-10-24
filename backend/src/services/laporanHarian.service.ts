import { prisma } from "../config/prisma";
import { validateFileIsAllowedDocument } from "../utils/fileValidation";

type CreateLaporanHarianInput = {
  tanggal: Date;
  kegiatan: string;
  linkGdrive?: string;
  dokumenNama?: string;
  dokumenMime?: string;
  dokumenUkuran?: number;
  dokumenBlob?: Uint8Array<ArrayBuffer>;
};

type ServiceError = Error & {
  status?: number;
};

const createServiceError = (message: string, status: number): ServiceError => {
  const error = new Error(message) as ServiceError;
  error.status = status;
  return error;
};

const acceptedMemberWhere = (proposalId: number, userId: number) => ({
  proposalId,
  userId,
  statusUndangan: "diterima" as const,
});

const verifyAcceptedProposalMember = async (
  proposalId: number,
  userId: number,
) => {
  const anggota = await prisma.proposalAnggota.findFirst({
    where: acceptedMemberWhere(proposalId, userId),
    select: { id: true },
  });

  if (!anggota) {
    throw createServiceError("Anda bukan anggota proposal ini", 403);
  }

  return anggota;
};

const findOwnedLaporanOrThrow = async (id: number, userId: number) => {
  const laporan = await prisma.laporanHarian.findUnique({
    where: { id },
  });

  if (!laporan) {
    throw createServiceError("Laporan tidak ditemukan", 404);
  }

  if (laporan.userId !== userId) {
    throw createServiceError("Akses ditolak", 403);
  }

  return laporan;
};

export const laporanHarianService = {
  /**
   * Ambil semua proposal di mana mahasiswa ini adalah anggota (statusUndangan = diterima)
   */
  async getMyProposals(userId: number) {
    const anggotaList = await prisma.proposalAnggota.findMany({
      where: {
        userId,
        statusUndangan: "diterima",
      },
      select: {
        id: true,
        peran: true,
        proposal: {
          select: {
            id: true,
            judul: true,
            jenis: true,
            status: true,
            pengusul: {
              select: {
                id: true,
                name: true,
                fullName: true,
              },
            },
            periode: {
              select: {
                id: true,
                nama: true,
                tahun: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return anggotaList.map((anggota) => ({
      anggotaId: anggota.id,
      peran: anggota.peran,
      ...anggota.proposal,
    }));
  },

  /**
   * Ambil semua laporan harian untuk proposal tertentu oleh mahasiswa ini
   */
  async getByProposal(proposalId: number, userId: number) {
    await verifyAcceptedProposalMember(proposalId, userId);

    return prisma.laporanHarian.findMany({
      where: {
        proposalId,
        userId,
      },
      select: {
        id: true,
        tanggal: true,
        kegiatan: true,
        dokumenNama: true,
        dokumenMime: true,
        dokumenUkuran: true,
        linkGdrive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        tanggal: "desc",
      },
    });
  },

  /**
   * Buat laporan harian baru
   */
  async create(
    proposalId: number,
    userId: number,
    data: CreateLaporanHarianInput,
  ) {
    await verifyAcceptedProposalMember(proposalId, userId);

    // Deteksi tipe file dari isi asli (magic bytes), bukan percaya
    // data.dokumenMime yang cuma diteruskan dari klaim mimetype client
    // (lihat buildCreatePayload di laporanHarian.controller.ts).
    const verifiedMimeType = data.dokumenBlob
      ? await validateFileIsAllowedDocument(Buffer.from(data.dokumenBlob!))
      : undefined;

    return prisma.laporanHarian.create({
      data: {
        proposalId,
        userId,
        ...data,
        ...(verifiedMimeType ? { dokumenMime: verifiedMimeType } : {}),
      },
      select: {
        id: true,
        tanggal: true,
        kegiatan: true,
        dokumenNama: true,
        dokumenMime: true,
        dokumenUkuran: true,
        linkGdrive: true,
        createdAt: true,
      },
    });
  },

  /**
   * Download dokumen laporan harian
   */
  async getDokumen(id: number, userId: number) {
    const laporan = await findOwnedLaporanOrThrow(id, userId);

    if (!laporan.dokumenBlob) {
      throw createServiceError("Dokumen tidak tersedia", 404);
    }

    return laporan;
  },

  /**
   * Hapus laporan harian
   */
  async delete(id: number, userId: number) {
    await findOwnedLaporanOrThrow(id, userId);

    await prisma.laporanHarian.delete({
      where: { id },
    });
  },
};
