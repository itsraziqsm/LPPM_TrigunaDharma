import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Menghapus semua data...");

  // Urutan: child dulu, baru parent (ikuti foreign key)
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dokumenLampiran.deleteMany();
  await prisma.laporanHarian.deleteMany();
  await prisma.laporanProposal.deleteMany();
  await prisma.proposalReview.deleteMany();
  await prisma.reviewerTugasan.deleteMany();
  await prisma.proposalAnggota.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.periode.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  console.log("✅ Semua data berhasil dihapus. Struktur tabel tetap utuh.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
