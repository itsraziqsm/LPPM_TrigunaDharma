import { RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";

/**
 * ==================================================
 * PROPOSAL ACCESS CONTROL
 * ==================================================
 * Satu sumber kebenaran untuk aturan "siapa boleh apa" terhadap sebuah
 * proposal, dipakai bersama oleh proposal.service.ts, dokumen.service.ts,
 * dan laporan.service.ts.
 *
 * KENAPA FILE INI ADA:
 * Sebelum perbaikan ini, ownership check (apakah user yang login memang
 * terkait dengan proposal yang diaksesnya) sudah diimplementasikan dengan
 * benar di Proposaldosen.service.ts (lihat ensureProposalOwner), tapi
 * proposal.service.ts / dokumen.service.ts / laporan.service.ts — yang
 * dipakai oleh route /api/v1/proposals/* — tidak pernah melakukan
 * pengecekan ini. Karena route tsb juga authorize("dosen", "mahasiswa"),
 * ini artinya SETIAP dosen/mahasiswa yang login bisa membaca, mengubah,
 * bahkan menghapus proposal ATAU dokumen/laporan milik user lain hanya
 * dengan menebak id di URL (IDOR / broken object-level authorization).
 *
 * ATURAN AKSES (disepakati berdasarkan skema Prisma & pola yang sudah
 * benar di Proposaldosen.service.ts):
 * - pengusul (pemilik/pengaju proposal) → full access (read & write)
 * - anggota tim dengan statusUndangan "diterima" → read & write bersama
 *   (anggota yang masih "pending"/"ditolak" TIDAK dihitung sebagai pihak
 *   sah, supaya orang yang belum/tidak menyetujui undangan tidak bisa
 *   ikut mengubah proposal)
 * - reviewer yang ditugaskan (ReviewerTugasan) → READ ONLY, untuk
 *   kebutuhan menilai proposal; reviewer tidak berwenang mengubah/
 *   menghapus proposal orang lain
 * - admin & ketua_lppm → full access ke semua proposal (kewenangan
 *   institusional untuk approval/monitoring), konsisten dengan role
 *   ini yang sudah dipakai di updateStatus/getAll
 */

export type ProposalAccessLevel = "write" | "read";

const FULL_ACCESS_ROLES: RoleName[] = [RoleName.admin, RoleName.ketua_lppm];

export class ProposalAccessError extends Error {
  statusCode = 403;

  constructor(message = "Anda tidak memiliki akses ke proposal ini") {
    super(message);
    this.name = "ProposalAccessError";
  }
}

function hasFullAccessRole(userRoles: RoleName[]): boolean {
  return userRoles.some((role) => FULL_ACCESS_ROLES.includes(role));
}

/**
 * Cek apakah user berwenang mengakses proposal tertentu.
 *
 * level "write": hanya pengusul, anggota yang sudah menerima undangan,
 *   atau admin/ketua_lppm.
 * level "read": semua di atas, ditambah reviewer yang ditugaskan ke
 *   proposal ini (reviewer perlu baca proposal untuk menilainya, tapi
 *   tidak boleh mengubahnya).
 *
 * Melempar ProposalAccessError (403) kalau tidak berwenang. Tidak
 * melempar 404 di sini — pengecekan "proposal ada atau tidak" tetap
 * jadi tanggung jawab pemanggil (biasanya lewat findUniqueOrThrow di
 * service masing-masing), supaya pesan error tetap jelas dan tidak
 * tertukar antara "tidak ada" vs "tidak berwenang".
 */
export async function ensureProposalAccess(
  proposalId: number,
  userId: number,
  userRoles: RoleName[],
  level: ProposalAccessLevel,
): Promise<void> {
  if (hasFullAccessRole(userRoles)) {
    return;
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { pengusulId: true },
  });

  // Proposal tidak ditemukan: biarkan pemanggil (findUniqueOrThrow, dsb)
  // yang menangani 404 seperti biasa — di sini cukup anggap tidak
  // berwenang supaya tidak ada informasi proposal yang bocor lewat
  // pesan error yang berbeda-beda.
  if (!proposal) {
    throw new ProposalAccessError();
  }

  if (proposal.pengusulId === userId) {
    return;
  }

  // Query eksplisit lewat compound unique key (proposalId + userId /
  // reviewerId) — pola yang sama dengan ensureReviewerAssignmentOrThrow
  // di reviewer.service.ts. Dijalankan paralel lewat Promise.all supaya
  // tidak menambah latency dibanding satu query nested.
  const [acceptedAnggota, assignedReviewer] = await Promise.all([
    prisma.proposalAnggota.findUnique({
      where: { proposalId_userId: { proposalId, userId } },
      select: { statusUndangan: true },
    }),
    level === "read"
      ? prisma.reviewerTugasan.findUnique({
          where: { proposalId_reviewerId: { proposalId, reviewerId: userId } },
          select: { id: true },
        })
      : null,
  ]);

  const isAcceptedAnggota = acceptedAnggota?.statusUndangan === "diterima";
  const isAssignedReviewer = level === "read" && assignedReviewer !== null;

  if (!isAcceptedAnggota && !isAssignedReviewer) {
    throw new ProposalAccessError();
  }
}
