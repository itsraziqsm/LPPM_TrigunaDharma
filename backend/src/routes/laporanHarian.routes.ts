import { Router } from "express";
import multer from "multer";

import { laporanHarianController } from "../controllers/laporanHarian.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const laporanHarianRouter = Router();

const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const uploadLaporanHarian = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    // Lihat catatan lengkap di proposal.routes.ts — defense-in-depth
    // untuk CVE-2026-5079, dengan cast yang sama untuk menjaga
    // kompatibilitas terhadap kemungkinan lag versi @types/multer.
    ...({ fieldNestingDepth: 5 } as Record<string, unknown>),
  },
  fileFilter: (_req, file, cb) => {
    const isAllowedFileType = ALLOWED_DOCUMENT_MIME_TYPES.includes(
      file.mimetype,
    );

    if (isAllowedFileType) {
      cb(null, true);
      return;
    }

    cb(new Error("Hanya file PDF atau DOCX yang diizinkan."));
  },
});

/**
 * Semua endpoint laporan harian hanya untuk mahasiswa yang terautentikasi
 */
laporanHarianRouter.use(authenticate);
laporanHarianRouter.use(authorize("mahasiswa"));

/**
 * List proposal di mana user ini adalah anggota
 * GET /laporan-harian/proposals
 */
laporanHarianRouter.get("/proposals", laporanHarianController.getMyProposals);

/**
 * Download dokumen
 * Route spesifik harus diletakkan sebelum route dinamis
 * GET /laporan-harian/dokumen/:id
 */
laporanHarianRouter.get("/dokumen/:id", laporanHarianController.getDokumen);

/**
 * List laporan harian per proposal
 * GET /laporan-harian/:proposalId
 */
laporanHarianRouter.get("/:proposalId", laporanHarianController.getByProposal);

/**
 * Buat laporan harian per proposal dengan upload file
 * POST /laporan-harian/:proposalId
 */
laporanHarianRouter.post(
  "/:proposalId",
  uploadLaporanHarian.single("file"),
  laporanHarianController.create,
);

/**
 * Hapus laporan harian
 * DELETE /laporan-harian/:id
 */
laporanHarianRouter.delete("/:id", laporanHarianController.delete);

export default laporanHarianRouter;
