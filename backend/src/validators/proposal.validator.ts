import { z } from "zod";

/**
 * Shared enums
 * Disentralisasi agar tidak ada duplikasi string literal
 * dan lebih mudah dirawat ketika dipakai lintas schema.
 */
const proposalJenisEnum = z.enum(["penelitian", "pengabdian"]);
const proposalStatusEnum = z.enum(["review", "revisi", "disetujui", "ditolak"]);
const rekomendasiReviewEnum = z.enum(["disetujui", "revisi", "ditolak"]);
const laporanJenisEnum = z.enum(["kemajuan", "akhir"]);

/**
 * Reusable field schemas
 * Dipisah agar konsisten dan mudah dipakai ulang.
 */
const positiveIntIdSchema = z.number().int().positive();
const positiveNumberSchema = z.number().positive();
const validUrlSchema = (message: string) => z.string().url(message);

/**
 * Reusable nested object schema
 */
const anggotaProposalSchema = z.object({
  userId: positiveIntIdSchema,
  peran: z.string().default("anggota"),
});

/**
 * Proposal schemas
 */
const proposalBaseSchema = z.object({
  judul: z.string().min(5, "Judul minimal 5 karakter"),
  abstrak: z.string().min(20, "Abstrak minimal 20 karakter"),
  jenis: proposalJenisEnum,
  anggaran: positiveNumberSchema.optional(),
  periodeId: positiveIntIdSchema.optional(),
  dokumenUrl: validUrlSchema("URL dokumen tidak valid").optional(),
  anggotaIds: z.array(anggotaProposalSchema).optional(),
});

export const createProposalSchema = proposalBaseSchema;

export const updateProposalSchema = proposalBaseSchema.partial();

export const updateStatusProposalSchema = z.object({
  status: proposalStatusEnum,
  catatanRevisi: z.string().optional(),
});

export const tugaskanReviewerSchema = z.object({
  reviewerIds: z.array(positiveIntIdSchema).min(1, "Minimal 1 reviewer"),
});

export const submitReviewSchema = z.object({
  nilaiRelevansi: z.string().optional(),
  nilaiMetodologi: z.string().optional(),
  nilaiAnggaran: z.string().optional(),
  nilaiLuaran: z.string().optional(),
  catatan: z.string().optional(),
  rekomendasi: rekomendasiReviewEnum.optional(),
});

/**
 * Laporan schemas
 */
const laporanBaseSchema = z.object({
  jenis: laporanJenisEnum,
  judul: z.string().min(3, "Judul minimal 3 karakter"),
  dokumenUrl: validUrlSchema("URL dokumen tidak valid"),
  keterangan: z.string().optional(),
});

export const createLaporanSchema = laporanBaseSchema;

export const updateLaporanSchema = laporanBaseSchema.partial();

/**
 * Dokumen schemas
 */
export const createDokumenSchema = z.object({
  namaFile: z.string().min(1, "Nama file wajib diisi"),
  fileUrl: validUrlSchema("URL file tidak valid").optional(),
  ukuran: positiveIntIdSchema.optional(),
});

/**
 * Optional exported types
 * Aman ditambahkan karena tidak mengubah runtime behavior,
 * dan sangat membantu service/controller typing.
 */
export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type UpdateProposalInput = z.infer<typeof updateProposalSchema>;
export type UpdateStatusProposalInput = z.infer<
  typeof updateStatusProposalSchema
>;
export type TugaskanReviewerInput = z.infer<typeof tugaskanReviewerSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type CreateLaporanInput = z.infer<typeof createLaporanSchema>;
export type UpdateLaporanInput = z.infer<typeof updateLaporanSchema>;
export type CreateDokumenInput = z.infer<typeof createDokumenSchema>;
export type AnggotaProposalInput = z.infer<typeof anggotaProposalSchema>;
