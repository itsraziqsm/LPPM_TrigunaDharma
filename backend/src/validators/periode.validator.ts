import { z } from "zod";

const periodeJenisEnum = z.enum(["penelitian", "pengabdian"]);

const periodeTanggalSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().date());

const periodeBaseSchema = z.object({
  nama: z.string().min(3, "Nama minimal 3 karakter"),
  tahun: z.number().int().min(2000).max(2100),
  jenis: periodeJenisEnum,
  tanggalMulai: periodeTanggalSchema,
  tanggalSelesai: periodeTanggalSchema,
  isAktif: z.boolean().optional(),
});

export const createPeriodeSchema = periodeBaseSchema;

export const updatePeriodeSchema = periodeBaseSchema.partial();

export type CreatePeriodeInput = z.infer<typeof createPeriodeSchema>;
export type UpdatePeriodeInput = z.infer<typeof updatePeriodeSchema>;
