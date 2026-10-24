import { fromBuffer } from "file-type";

/**
 * `file.mimetype` dari multer itu murni klaim header Content-Type yang
 * dikirim CLIENT saat upload — gampang dipalsukan (misal file .html dikirim
 * dengan header "application/pdf" supaya lolos filter multer). Kalau nanti
 * file ini di-render sebagai "inline" di browser (lihat setDownloadHeaders
 * di controller), file yang sebenarnya HTML/SVG bisa dieksekusi sebagai
 * script di konteks domain aplikasi ini — stored XSS.
 *
 * Fungsi ini membaca signature asli dari ISI file (magic bytes/file
 * signature), bukan dari klaim client, jauh lebih sulit dipalsukan karena
 * butuh file yang strukturnya benar-benar valid sebagai format tsb.
 */

/**
 * CATATAN VERSI: package "file-type" yang di-pin di package.json project
 * ini adalah versi lawas (16.5.4). Nama fungsi ini di-rename dari
 * `fromBuffer` menjadi `fileTypeFromBuffer` di rilis MAYOR setelah 16.x
 * (dikonfirmasi lewat rilis-rilis terbaru package ini yang API publiknya
 * sudah pakai nama baru). Dokumentasi resmi terkini di halaman npm
 * package ini menampilkan API versi terbaru (`fileTypeFromBuffer`) —
 * kalau project ini nanti diupgrade ke file-type versi baru, import ini
 * perlu diubah balik ke `fileTypeFromBuffer` mengikuti API versi
 * tersebut, BUKAN dibiarkan sebagai `fromBuffer`.
 */
const fileTypeFromBuffer = fromBuffer;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

type AllowedMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export class InvalidFileTypeError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvalidFileTypeError";
  }
}

/**
 * Deteksi tipe file asli dari buffer, lalu pastikan itu ada di whitelist.
 * Melempar InvalidFileTypeError kalau tidak cocok atau tidak terdeteksi
 * (misal file kosong, corrupt, atau memang bukan PDF/DOCX beneran).
 *
 * CATATAN: file .docx modern sebenarnya adalah file ZIP (Office Open XML).
 * Library file-type sudah menangani ini secara internal — dia memeriksa
 * struktur XML di dalam zip untuk membedakan docx/xlsx/pptx/zip biasa,
 * dan langsung mengembalikan mime docx yang spesifik (bukan "application/zip"
 * generik). Kode di bawah ini cuma membaca hasil akhirnya, tidak melakukan
 * pengecekan zip secara terpisah.
 */
export async function validateFileIsAllowedDocument(
  buffer: Buffer,
): Promise<AllowedMimeType> {
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    throw new InvalidFileTypeError(
      "Tidak dapat mendeteksi tipe file. Pastikan file tidak corrupt.",
    );
  }

  if (detected.mime === "application/pdf") {
    return "application/pdf";
  }

  if (
    detected.mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  throw new InvalidFileTypeError(
    `Tipe file "${detected.mime}" tidak diizinkan. Hanya PDF atau DOCX yang diterima.`,
  );
}