import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  RoleName,
  JenisKegiatan,
  NotifType,
} from "@prisma/client";

import { prisma } from "./prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// NIDN unik: prefix 2 digit + 8 digit index, total 10 digit
function makeNidn(prefix: string, i: number): string {
  return `${prefix}${String(i).padStart(8, "0")}`;
}

/**
 * Buat placeholder PDF minimal (~400 bytes) yang valid secara struktur.
 * Berguna untuk test endpoint download tanpa perlu file fisik nyata.
 */
function makeFakePdfBlob(label: string): Uint8Array {
  const content = `Laporan Harian - ${label}\nIni adalah dokumen placeholder untuk keperluan seeding.\nDibuat otomatis oleh seeder.`;
  const body = `BT /F1 12 Tf 50 750 Td (${content.replace(/\n/g, ") Tj T* (")}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj`,
    `4 0 obj<</Length ${body.length}>>stream\n${body}\nendstream endobj`,
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "trailer<</Size 5/Root 1 0 R>>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n");
  return new Uint8Array(Buffer.from(pdf, "utf-8"));
}

// Nama file dummy untuk laporan harian berdasarkan indeks
const NAMA_FILE_LAPORAN = [
  "catatan_kegiatan.pdf",
  "progress_report.pdf",
  "dokumentasi_riset.pdf",
  "laporan_mingguan.pdf",
  "hasil_eksperimen.pdf",
];

// ─── Data Fixtures ────────────────────────────────────────────────────────────

const PRODI_DOSEN = [
  "Teknik Informatika",
  "Sistem Informasi",
  "Sistem Komputer",
  "Teknik Elektro",
  "Manajemen Informatika",
];

const PRODI_MAHASISWA = [
  "Teknik Informatika",
  "Sistem Informasi",
  "Sistem Komputer",
  "Manajemen Informatika",
];

const JUDUL_PENELITIAN = [
  "Implementasi Machine Learning untuk Deteksi Penyakit Tanaman Berbasis Citra Digital",
  "Pengembangan Sistem Rekomendasi Wisata Berbasis Collaborative Filtering",
  "Analisis Sentimen Media Sosial Menggunakan Transformer Model",
  "Optimasi Algoritma Pencarian Rute Terpendek pada Graf Berbobot",
  "Rancang Bangun Sistem Monitoring IoT untuk Smart Greenhouse",
  "Klasifikasi Teks Bahasa Indonesia Menggunakan BERT",
  "Sistem Deteksi Intrusi Jaringan Berbasis Deep Learning",
  "Pengembangan Aplikasi Mobile Kesehatan Berbasis Flutter",
  "Implementasi Blockchain untuk Keamanan Data Rekam Medis",
  "Prediksi Harga Saham Menggunakan LSTM Neural Network",
  "Analisis Kualitas Udara Berbasis Sensor IoT dan Big Data",
  "Penerapan Computer Vision untuk Sistem Absensi Wajah",
  "Deteksi Dini Kebocoran Pipa Gas Menggunakan Sensor Akustik dan Edge Computing",
  "Sistem Rekomendasi Pemilihan Peminatan Mahasiswa Berbasis Naive Bayes",
];

const JUDUL_PENGABDIAN = [
  "Pelatihan Literasi Digital untuk Masyarakat Desa Terpencil",
  "Pendampingan UMKM dalam Pemanfaatan Platform E-Commerce",
  "Sosialisasi Keamanan Siber untuk Siswa SMA di Kabupaten Deli Serdang",
  "Pemberdayaan Petani Melalui Aplikasi Pertanian Cerdas",
  "Workshop Desain Grafis dan Multimedia untuk Pengusaha Muda",
  "Program Coding untuk Anak-Anak di Panti Asuhan",
  "Pendampingan Digitalisasi Pembukuan Koperasi Desa",
  "Pelatihan Pemanfaatan AI untuk Guru Sekolah Menengah",
];

const ABSTRAK_TEMPLATE = (judul: string, jenis: string) =>
  `Penelitian ini berjudul "${judul}". Latar belakang ${jenis} ini didasarkan pada kebutuhan yang semakin mendesak akan solusi teknologi informasi yang inovatif. Tujuan utama adalah menghasilkan sistem yang dapat meningkatkan efisiensi dan efektivitas proses yang ada. Metode yang digunakan meliputi studi literatur, perancangan sistem, implementasi, dan pengujian menggunakan pendekatan agile development. Hasil yang diharapkan berupa prototipe fungsional yang telah diuji dan terdokumentasi dengan baik. Luaran penelitian ini mencakup publikasi ilmiah pada jurnal terindeks dan HKI.`;

const CATATAN_REVIEW = [
  "Metodologi penelitian sudah cukup baik, namun perlu diperjelas pada bagian pengumpulan data.",
  "Topik sangat relevan dengan kebutuhan industri saat ini. Anggaran perlu direvisi lebih detail.",
  "Abstrak perlu diperbaiki, terutama pada bagian tujuan dan luaran yang masih kurang spesifik.",
  "Penelitian ini memiliki potensi besar. Referensi literatur perlu diperbarui dengan artikel terbaru.",
  "Secara keseluruhan proposal sudah baik. Perlu ditambahkan timeline yang lebih rinci.",
];

const CATATAN_REVIEW_TIDAK_SEPAKAT = [
  "Saya menilai proposal ini masih memerlukan revisi signifikan pada metodologi sebelum layak dilanjutkan.",
  "Anggaran yang diajukan tidak proporsional dengan luaran yang dijanjikan; perlu ditinjau ulang.",
];

const CATATAN_REVISI = [
  "Mohon perjelas metodologi penelitian dan tambahkan referensi literatur terbaru (5 tahun terakhir).",
  "Anggaran perlu direvisi — beberapa pos tidak sesuai dengan standar institusi.",
  "Abstrak perlu diperbaiki: tambahkan novelty, tujuan spesifik, dan luaran yang terukur.",
];

const CATATAN_PENOLAKAN_ANGGOTA = [
  "Mohon maaf, jadwal saya bentrok dengan kegiatan lain di periode ini.",
  "Saat ini saya sedang fokus menyelesaikan tugas akhir sehingga belum bisa berkomitmen penuh.",
];

// ─── Laporan Harian Fixtures ──────────────────────────────────────────────────

const KEGIATAN_LAPORAN = [
  "Melakukan studi literatur terkait topik penelitian dan mencatat referensi yang relevan.",
  "Menyusun bab I (Pendahuluan) termasuk latar belakang, rumusan masalah, dan tujuan penelitian.",
  "Melakukan pengumpulan dataset dari sumber terbuka untuk keperluan eksperimen.",
  "Preprocessing data: membersihkan missing value, normalisasi, dan encoding fitur kategorikal.",
  "Implementasi model baseline menggunakan algoritma yang sudah ditentukan pada metodologi.",
  "Evaluasi model awal dan analisis hasil dengan confusion matrix serta metrik akurasi.",
  "Melakukan tuning hyperparameter untuk meningkatkan performa model.",
  "Dokumentasi kode dan penulisan laporan kemajuan minggu ini.",
  "Diskusi dengan ketua peneliti mengenai perkembangan riset dan kendala yang dihadapi.",
  "Menyusun draft bab II (Tinjauan Pustaka) berdasarkan literatur yang sudah dikumpulkan.",
  "Implementasi antarmuka pengguna untuk demonstrasi hasil penelitian.",
  "Uji coba sistem dengan data baru dan analisis performa pada skenario yang berbeda.",
  "Perbaikan bug pada implementasi berdasarkan hasil pengujian sebelumnya.",
  "Menyusun tabel perbandingan hasil eksperimen dengan metode yang sudah ada.",
  "Finalisasi laporan dan persiapan presentasi hasil penelitian.",
];

// ─── Deletion Request Fixtures ────────────────────────────────────────────────

const ALASAN_DELETION_REQUEST = [
  "Periode ini dibuat duplikat secara tidak sengaja saat input data awal.",
  "Tanggal periode salah input dan periode pengganti sudah dibuat dengan benar.",
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Memulai seeding lengkap...\n");

  // ── 1. Roles ──────────────────────────────────────────────────────────────
  console.log("📋 Membuat roles...");
  const roleNames: RoleName[] = [
    "admin",
    "ketua_lppm",
    "dosen",
    "reviewer",
    "mahasiswa",
  ];
  const roles: Record<string, { id: number }> = {};
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roles[name] = role;
    console.log(`  ✔ Role: ${name}`);
  }

  // ── 2. Helper ─────────────────────────────────────────────────────────────
  const createUser = async (
    email: string,
    name: string,
    password: string,
    extra: Record<string, unknown>,
    userRoles: RoleName[],
    status: "approved" | "pending" | "rejected" = "approved",
  ) => {
    const hashed = await bcrypt.hash(password, 10);
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        fullName: name,
        password: hashed,
        status,
        ...extra,
        roles: {
          create: userRoles.map((r) => ({ roleId: roles[r].id })),
        },
      },
    });
  };

  // ── 3. Admin ──────────────────────────────────────────────────────────────
  console.log("\n👤 Membuat users...");
  const admin = await createUser(
    "admin@lppm.dev",
    "Admin LPPM",
    "admin123456",
    { institusi: "Universitas LPPM" },
    ["admin"],
  );
  console.log("  ✔ admin@lppm.dev");

  // ── 4. Ketua LPPM ─────────────────────────────────────────────────────────
  const ketuaLppm = await createUser(
    "ketua@lppm.dev",
    "Dr. Ketua LPPM, M.Kom",
    "ketua123456",
    {
      nidn: makeNidn("99", 1),
      institusi: "Universitas LPPM",
      programStudi: "Teknik Informatika",
    },
    ["ketua_lppm"],
  );
  console.log("  ✔ ketua@lppm.dev");

  // ── 4b. Wakil Ketua LPPM (dosen senior yang JUGA menjabat ketua_lppm) ──────
  // Edge case: lebih dari satu user dengan role ketua_lppm sekaligus,
  // untuk menguji UI/endpoint yang berasumsi ketua hanya 1 orang.
  const wakilKetuaLppm = await createUser(
    "wakil.ketua@lppm.dev",
    "Dr. Wakil Ketua LPPM, M.T",
    "wakil123456",
    {
      nidn: makeNidn("98", 1),
      institusi: "Universitas LPPM",
      programStudi: "Sistem Informasi",
    },
    ["ketua_lppm", "dosen"],
  );
  console.log("  ✔ wakil.ketua@lppm.dev (+dosen)");

  // ── 5. Reviewer khusus (prefix "88") ─────────────────────────────────────
  const reviewers = [];
  for (let i = 1; i <= 4; i++) {
    const r = await createUser(
      `reviewer${i}@lppm.dev`,
      `Dr. Reviewer ${i}, M.T`,
      "reviewer123",
      {
        nidn: makeNidn("88", i),
        institusi: "Universitas LPPM",
        programStudi: PRODI_DOSEN[(i - 1) % PRODI_DOSEN.length],
      },
      ["reviewer"],
    );
    reviewers.push(r);
    console.log(`  ✔ reviewer${i}@lppm.dev`);
  }

  // ── 5b. Reviewer berstatus pending (baru daftar, belum diapprove admin) ───
  await createUser(
    "pending.reviewer@lppm.dev",
    "Calon Reviewer Baru",
    "pending123",
    {
      nidn: makeNidn("87", 1),
      institusi: "Universitas LPPM",
      programStudi: "Teknik Elektro",
    },
    ["reviewer"],
    "pending",
  );
  console.log("  ✔ pending.reviewer@lppm.dev (status: pending)");

  // ── 6. Dosen (prefix "01", i=1..12) ─────────────────────────────────────
  const dosens = [];
  for (let i = 1; i <= 12; i++) {
    const isAlsoReviewer = i <= 3;
    const d = await createUser(
      `dosen${i}@lppm.dev`,
      `${i % 3 === 0 ? "Prof. " : "Dr. "}Dosen ${i}${i % 2 === 0 ? ", M.Kom" : ", M.T"}`,
      "dosen123456",
      {
        nidn: makeNidn("01", i),
        institusi: "Universitas LPPM",
        programStudi: PRODI_DOSEN[(i - 1) % PRODI_DOSEN.length],
        alamat: `Jl. Akademik No. ${i * 3}, Medan`,
        kontak: `0812000${String(i).padStart(5, "0")}`,
      },
      isAlsoReviewer ? ["dosen", "reviewer"] : ["dosen"],
    );
    dosens.push(d);
    console.log(
      `  ✔ dosen${i}@lppm.dev${isAlsoReviewer ? " (+reviewer)" : ""}`,
    );
  }

  // ── 7. Mahasiswa ─────────────────────────────────────────────────────────
  const mahasiswas = [];
  for (let i = 1; i <= 8; i++) {
    const m = await createUser(
      `mahasiswa${i}@lppm.dev`,
      `Mahasiswa ${i}`,
      "mhs1234567",
      {
        nim: `2021${String(i).padStart(6, "0")}`,
        prodi: PRODI_MAHASISWA[(i - 1) % PRODI_MAHASISWA.length],
        noHp: `0813000${String(i).padStart(5, "0")}`,
      },
      ["mahasiswa"],
    );
    mahasiswas.push(m);
    console.log(`  ✔ mahasiswa${i}@lppm.dev`);
  }

  // ── 8. Pending & rejected ─────────────────────────────────────────────────
  await createUser(
    "pending.dosen@lppm.dev",
    "Calon Dosen Baru",
    "pending123",
    {
      nidn: makeNidn("77", 1),
      institusi: "Universitas LPPM",
      programStudi: "Teknik Informatika",
    },
    ["dosen"],
    "pending",
  );
  await createUser(
    "rejected.mhs@lppm.dev",
    "Mahasiswa Ditolak",
    "rejected123",
    { nim: "2021999999", prodi: "Sistem Informasi" },
    ["mahasiswa"],
    "rejected",
  );
  console.log("  ✔ pending.dosen@lppm.dev (status: pending)");
  console.log("  ✔ rejected.mhs@lppm.dev  (status: rejected)");

  // ── 9. Periode ────────────────────────────────────────────────────────────
  console.log("\n📅 Membuat periode...");
  const periodeData = [
    {
      nama: "Penelitian Semester Ganjil 2024",
      tahun: 2024,
      jenis: "penelitian" as JenisKegiatan,
      tanggalMulai: new Date("2024-08-01"),
      tanggalSelesai: new Date("2024-12-31"),
      isAktif: false,
    },
    {
      nama: "Pengabdian Semester Ganjil 2024",
      tahun: 2024,
      jenis: "pengabdian" as JenisKegiatan,
      tanggalMulai: new Date("2024-08-01"),
      tanggalSelesai: new Date("2024-12-31"),
      isAktif: false,
    },
    {
      nama: "Penelitian Semester Genap 2025",
      tahun: 2025,
      jenis: "penelitian" as JenisKegiatan,
      tanggalMulai: new Date("2025-02-01"),
      tanggalSelesai: new Date("2025-07-31"),
      isAktif: false,
    },
    {
      nama: "Pengabdian Semester Genap 2025",
      tahun: 2025,
      jenis: "pengabdian" as JenisKegiatan,
      tanggalMulai: new Date("2025-02-01"),
      tanggalSelesai: new Date("2025-07-31"),
      isAktif: false,
    },
    {
      nama: "Penelitian Semester Ganjil 2025",
      tahun: 2025,
      jenis: "penelitian" as JenisKegiatan,
      tanggalMulai: daysAgo(30),
      tanggalSelesai: daysFromNow(150),
      isAktif: true,
    },
    {
      nama: "Pengabdian Semester Ganjil 2025",
      tahun: 2025,
      jenis: "pengabdian" as JenisKegiatan,
      tanggalMulai: daysAgo(30),
      tanggalSelesai: daysFromNow(150),
      isAktif: true,
    },
    {
      // Edge case baru: periode masa depan yang belum dimulai.
      // Berguna untuk menguji UI/validasi "belum bisa submit proposal
      // karena periode belum berjalan".
      nama: "Penelitian Semester Genap 2026",
      tahun: 2026,
      jenis: "penelitian" as JenisKegiatan,
      tanggalMulai: daysFromNow(60),
      tanggalSelesai: daysFromNow(240),
      isAktif: false,
    },
  ];
  const periodes = [];
  for (const pd of periodeData) {
    const p = await prisma.periode.create({ data: pd });
    periodes.push(p);
    console.log(`  ✔ ${pd.nama} (aktif: ${pd.isAktif})`);
  }
  const periodeAktifPenelitian = periodes[4];
  const periodeAktifPengabdian = periodes[5];
  const periodeLama = periodes[0];
  const periodeMasaDepan = periodes[6];

  // ── Helpers: log & notif ──────────────────────────────────────────────────
  const logActivity = async (
    userId: number,
    action: string,
    proposalId?: number,
    detail?: string,
  ) => {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        entityType: proposalId ? "proposal" : undefined,
        entityId: proposalId,
        proposalId,
        detail,
      },
    });
  };

  const notify = async (
    userId: number,
    type: NotifType,
    judul: string,
    pesan: string,
    refId?: number,
    isRead = false,
  ) => {
    await prisma.notification.create({
      data: {
        userId,
        type,
        judul,
        pesan,
        isRead,
        refId,
        refType: refId ? "proposal" : null,
      },
    });
  };

  // ── 10. Proposals ─────────────────────────────────────────────────────────
  console.log("\n📄 Membuat proposals...");

  // ── DRAFT ─────────────────────────────────────────────────────────────────
  // i=0,1: draft dengan dokumen sudah terupload (kasus umum)
  // i=2  : draft TANPA dokumen sama sekali — kasus baru yang belum diuji di
  //        seed lama, penting untuk memastikan UI tidak crash saat dokumenUrl null.
  const draftProposals = [];
  for (let i = 0; i < 3; i++) {
    const pengusul = i < 2 ? dosens[i + 9] : mahasiswas[6];
    const jenis: JenisKegiatan = i % 2 === 0 ? "penelitian" : "pengabdian";
    const judul =
      jenis === "penelitian"
        ? JUDUL_PENELITIAN[i + 9]
        : JUDUL_PENGABDIAN[i + 3];
    const belumUploadDokumen = i === 2;
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, jenis),
        jenis,
        status: "draft",
        anggaran: belumUploadDokumen ? null : randomBetween(5, 25) * 1_000_000,
        pengusulId: pengusul.id,
        periodeId:
          jenis === "penelitian"
            ? periodeAktifPenelitian.id
            : periodeAktifPengabdian.id,
        dokumenUrl: belumUploadDokumen
          ? null
          : `https://drive.google.com/file/d/draft_${i + 1}/view`,
      },
    });
    draftProposals.push(p);
    await logActivity(
      pengusul.id,
      "CREATE_PROPOSAL",
      p.id,
      belumUploadDokumen
        ? `Membuat proposal draft (dokumen belum diunggah)`
        : `Membuat proposal draft`,
    );
    console.log(
      `  ✔ [draft${belumUploadDokumen ? ", tanpa dokumen" : ""}] ${judul.slice(0, 45)}...`,
    );
  }

  // ── Draft tanpa periode ───────────────────────────────────────────────────
  // Edge case baru: periodeId nullable di schema, tapi seed lama tidak pernah
  // membuat proposal dengan periodeId = null. Berguna untuk menguji tampilan
  // "Periode: -" atau filter by periode yang mengecualikan proposal ini.
  const judulDraftTanpaPeriode =
    JUDUL_PENELITIAN[JUDUL_PENELITIAN.length - 1];
  const draftTanpaPeriode = await prisma.proposal.create({
    data: {
      judul: judulDraftTanpaPeriode,
      abstrak: ABSTRAK_TEMPLATE(judulDraftTanpaPeriode, "penelitian"),
      jenis: "penelitian",
      status: "draft",
      pengusulId: dosens[11].id,
      periodeId: null,
      dokumenUrl: null,
    },
  });
  draftProposals.push(draftTanpaPeriode);
  await logActivity(
    dosens[11].id,
    "CREATE_PROPOSAL",
    draftTanpaPeriode.id,
    "Membuat proposal draft (belum memilih periode)",
  );
  console.log(
    `  ✔ [draft, tanpa periode] ${judulDraftTanpaPeriode.slice(0, 45)}...`,
  );

  // ── DIAJUKAN ──────────────────────────────────────────────────────────────
  // statusUndangan: pending — undangan belum direspon mahasiswa
  const diajukanProposals = [];
  for (let i = 0; i < 3; i++) {
    const pengusul = dosens[i + 5];
    const jenis: JenisKegiatan = i % 2 === 0 ? "penelitian" : "pengabdian";
    const judul =
      jenis === "penelitian" ? JUDUL_PENELITIAN[i + 6] : JUDUL_PENGABDIAN[i];
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, jenis),
        jenis,
        status: "diajukan",
        anggaran: randomBetween(10, 50) * 1_000_000,
        pengusulId: pengusul.id,
        periodeId:
          jenis === "penelitian"
            ? periodeAktifPenelitian.id
            : periodeAktifPengabdian.id,
        dokumenUrl: `https://drive.google.com/file/d/diajukan_${i + 1}/view`,
        submittedAt: daysAgo(randomBetween(1, 5)),
        anggota: {
          // statusUndangan default = pending (belum direspon)
          create: [
            {
              userId: mahasiswas[i].id,
              peran: "anggota",
              statusUndangan: "pending",
            },
            {
              userId: mahasiswas[i + 1].id,
              peran: "anggota",
              statusUndangan: "pending",
            },
          ],
        },
      },
    });
    diajukanProposals.push(p);
    await logActivity(
      pengusul.id,
      "SUBMIT_PROPOSAL",
      p.id,
      `Mengajukan proposal`,
    );
    await notify(
      ketuaLppm.id,
      "proposal_diajukan",
      "Proposal Baru Diajukan",
      `${pengusul.name} mengajukan proposal: "${judul.slice(0, 60)}..."`,
      p.id,
    );
    console.log(`  ✔ [diajukan] ${judul.slice(0, 55)}...`);
  }

  // ── Diajukan solo (tanpa anggota tim sama sekali) ─────────────────────────
  // Edge case baru: seed lama selalu memberi 2 anggota ke tiap proposal
  // "diajukan". Proposal solo penting untuk menguji tampilan tim kosong.
  const judulDiajukanSolo = JUDUL_PENGABDIAN[JUDUL_PENGABDIAN.length - 1];
  const diajukanSolo = await prisma.proposal.create({
    data: {
      judul: judulDiajukanSolo,
      abstrak: ABSTRAK_TEMPLATE(judulDiajukanSolo, "pengabdian"),
      jenis: "pengabdian",
      status: "diajukan",
      anggaran: randomBetween(8, 20) * 1_000_000,
      pengusulId: dosens[10].id,
      periodeId: periodeAktifPengabdian.id,
      dokumenUrl: `https://drive.google.com/file/d/diajukan_solo/view`,
      submittedAt: daysAgo(2),
    },
  });
  diajukanProposals.push(diajukanSolo);
  await logActivity(
    dosens[10].id,
    "SUBMIT_PROPOSAL",
    diajukanSolo.id,
    "Mengajukan proposal (perorangan, tanpa anggota tim)",
  );
  await notify(
    ketuaLppm.id,
    "proposal_diajukan",
    "Proposal Baru Diajukan",
    `${dosens[10].name} mengajukan proposal: "${judulDiajukanSolo.slice(0, 60)}..."`,
    diajukanSolo.id,
  );
  console.log(`  ✔ [diajukan, solo] ${judulDiajukanSolo.slice(0, 45)}...`);

  // ── REVIEW ────────────────────────────────────────────────────────────────
  // statusUndangan: mix pending, diterima, DAN ditolak — variasi respon anggota
  const reviewProposals = [];
  for (let i = 0; i < 4; i++) {
    const pengusul = i < 3 ? dosens[i] : mahasiswas[0];
    const jenis: JenisKegiatan = i % 2 === 0 ? "penelitian" : "pengabdian";
    const judul =
      jenis === "penelitian"
        ? JUDUL_PENELITIAN[i + 3]
        : JUDUL_PENGABDIAN[i % JUDUL_PENGABDIAN.length];
    const rv1 = reviewers[i % reviewers.length];
    const rv2 = dosens[i % 3]; // dosen yang juga reviewer
    // i=0 → diterima, i=1 → pending, i=2 → diterima, i=3 → ditolak (BARU)
    const statusUndanganAnggota =
      i === 3 ? "ditolak" : i % 2 === 0 ? "diterima" : "pending";
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, jenis),
        jenis,
        status: "review",
        anggaran: randomBetween(15, 75) * 1_000_000,
        pengusulId: pengusul.id,
        periodeId:
          jenis === "penelitian"
            ? periodeAktifPenelitian.id
            : periodeAktifPengabdian.id,
        dokumenUrl: `https://drive.google.com/file/d/review_${i + 1}/view`,
        submittedAt: daysAgo(randomBetween(7, 14)),
        anggota: {
          create: [
            {
              userId: mahasiswas[(i + 2) % mahasiswas.length].id,
              peran: "anggota",
              statusUndangan: statusUndanganAnggota,
            },
          ],
        },
        reviewerTugasan: {
          create: [{ reviewerId: rv1.id }, { reviewerId: rv2.id }],
        },
        dokumenLampiran: {
          create: [
            {
              namaFile: "SK_Dekan.pdf",
              fileUrl: `https://storage.lppm.dev/sk_dekan_${i + 1}.pdf`,
              ukuran: randomBetween(100, 500) * 1024,
            },
            {
              namaFile: "Surat_Tugas.pdf",
              fileUrl: `https://storage.lppm.dev/surat_tugas_${i + 1}.pdf`,
              ukuran: randomBetween(50, 200) * 1024,
            },
          ],
        },
      },
    });
    reviewProposals.push(p);
    for (const rv of [rv1, rv2]) {
      await notify(
        rv.id,
        "reviewer_ditugaskan",
        "Anda Ditugaskan sebagai Reviewer",
        `Anda ditugaskan me-review: "${judul.slice(0, 60)}..."`,
        p.id,
      );
      await logActivity(
        ketuaLppm.id,
        "ASSIGN_REVIEWER",
        p.id,
        `Menugaskan ${rv.name}`,
      );
    }
    // Notifikasi ke pengusul saat anggota menolak undangan (kasus i=3)
    if (statusUndanganAnggota === "ditolak") {
      await logActivity(
        mahasiswas[(i + 2) % mahasiswas.length].id,
        "RESPOND_INVITATION",
        p.id,
        `Menolak undangan: ${pickRandom(CATATAN_PENOLAKAN_ANGGOTA)}`,
      );
    }
    console.log(
      `  ✔ [review, anggota ${statusUndanganAnggota}] ${judul.slice(0, 40)}...`,
    );
  }

  // ── Draft review untuk beberapa proposal review ───────────────────────────
  // i=0 → reviewer masih mengerjakan (isDone: false)
  // i=1 → reviewer SUDAH selesai TAPI belum sepakat dengan reviewer lain (BARU):
  //       rv1 sudah submit rekomendasi "revisi" sementara rv2 belum submit apa-apa,
  //       mensimulasikan proposal yang perlu keputusan ketua karena reviewer belum bulat.
  for (let i = 0; i < 2; i++) {
    const proposal = reviewProposals[i];
    const rv = reviewers[i % reviewers.length];
    const existing = await prisma.proposalReview.findUnique({
      where: {
        proposalId_reviewerId: { proposalId: proposal.id, reviewerId: rv.id },
      },
    });
    if (!existing) {
      const sudahSelesaiTapiBedaPendapat = i === 1;
      await prisma.proposalReview.create({
        data: {
          proposalId: proposal.id,
          reviewerId: rv.id,
          nilaiRelevansi: String(randomBetween(3, 5)),
          nilaiMetodologi: String(randomBetween(2, 3)),
          catatan: sudahSelesaiTapiBedaPendapat
            ? pickRandom(CATATAN_REVIEW_TIDAK_SEPAKAT)
            : "Sedang dalam proses review...",
          rekomendasi: sudahSelesaiTapiBedaPendapat ? "revisi" : undefined,
          isDone: sudahSelesaiTapiBedaPendapat,
        },
      });
    }
  }

  // ── REVISI ────────────────────────────────────────────────────────────────
  // statusUndangan: diterima — anggota sudah bergabung dan tahu revisi harus dilakukan
  const revisiProposals = [];
  for (let i = 0; i < 2; i++) {
    const pengusul = dosens[i + 3];
    const judul = JUDUL_PENELITIAN[i + 1];
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, "penelitian"),
        jenis: "penelitian",
        status: "revisi",
        anggaran: randomBetween(20, 60) * 1_000_000,
        catatanRevisi: CATATAN_REVISI[i],
        pengusulId: pengusul.id,
        periodeId: periodeAktifPenelitian.id,
        dokumenUrl: `https://drive.google.com/file/d/revisi_${i + 1}/view`,
        submittedAt: daysAgo(randomBetween(14, 21)),
        anggota: {
          create: [
            {
              userId: mahasiswas[(i + 3) % mahasiswas.length].id,
              peran: "anggota",
              statusUndangan: "diterima", // sudah bergabung, ikut perbaiki revisi
            },
          ],
        },
      },
    });
    revisiProposals.push(p);
    await notify(
      pengusul.id,
      "proposal_revisi",
      "Proposal Perlu Direvisi",
      `Proposal Anda perlu direvisi. ${CATATAN_REVISI[i]}`,
      p.id,
    );
    await logActivity(
      ketuaLppm.id,
      "UPDATE_PROPOSAL_STATUS",
      p.id,
      `Status diubah ke revisi`,
    );
    console.log(`  ✔ [revisi] ${judul.slice(0, 55)}...`);
  }

  // ── DISETUJUI ─────────────────────────────────────────────────────────────
  // statusUndangan: diterima — semua anggota sudah bergabung, penelitian berjalan
  const disetujuiProposals = [];
  for (let i = 0; i < 4; i++) {
    const pengusul = dosens[i];
    const jenis: JenisKegiatan = i % 2 === 0 ? "penelitian" : "pengabdian";
    const judul =
      jenis === "penelitian"
        ? JUDUL_PENELITIAN[i]
        : JUDUL_PENGABDIAN[i % JUDUL_PENGABDIAN.length];
    const rv = reviewers[i % reviewers.length];
    const nr = String(randomBetween(3, 5));
    const nm = String(randomBetween(3, 5));
    const na = String(randomBetween(3, 5));
    const nl = String(randomBetween(3, 5));
    // Variasi status baca notifikasi: bukan selalu true seperti seed lama.
    // i=0,1 → sudah dibaca; i=2,3 → belum dibaca (masih ada badge notifikasi).
    const notifSudahDibaca = i < 2;
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, jenis),
        jenis,
        status: "disetujui",
        anggaran: randomBetween(20, 100) * 1_000_000,
        pengusulId: pengusul.id,
        periodeId: jenis === "penelitian" ? periodeLama.id : periodes[1].id,
        dokumenUrl: `https://drive.google.com/file/d/disetujui_${i + 1}/view`,
        submittedAt: daysAgo(randomBetween(60, 90)),
        approvedAt: daysAgo(randomBetween(30, 60)),
        anggota: {
          create: [
            {
              userId: mahasiswas[i % mahasiswas.length].id,
              peran: "anggota",
              statusUndangan: "diterima", // anggota aktif, bisa kirim laporan harian
            },
            {
              userId: mahasiswas[(i + 1) % mahasiswas.length].id,
              peran: "anggota",
              statusUndangan: "diterima", // anggota aktif
            },
          ],
        },
        reviewerTugasan: { create: [{ reviewerId: rv.id }] },
        reviews: {
          create: [
            {
              reviewerId: rv.id,
              nilaiRelevansi: nr,
              nilaiMetodologi: nm,
              nilaiAnggaran: na,
              nilaiLuaran: nl,
              catatan: CATATAN_REVIEW[i % CATATAN_REVIEW.length],
              rekomendasi: "disetujui",
              isDone: true,
            },
          ],
        },
        laporan: {
          create: [
            {
              jenis: "kemajuan",
              judul: `Laporan Kemajuan: ${judul.slice(0, 40)}`,
              dokumenUrl: `https://storage.lppm.dev/lap_kemajuan_${i + 1}.pdf`,
              keterangan: "Laporan kemajuan 50%",
            },
            ...(i < 2
              ? [
                  {
                    jenis: "akhir",
                    judul: `Laporan Akhir: ${judul.slice(0, 40)}`,
                    dokumenUrl: `https://storage.lppm.dev/lap_akhir_${i + 1}.pdf`,
                    keterangan: "Laporan akhir pelaksanaan",
                  },
                ]
              : []),
          ],
        },
        dokumenLampiran: {
          create: [
            {
              namaFile: "SK_Penelitian.pdf",
              fileUrl: `https://storage.lppm.dev/sk_${i + 1}.pdf`,
              ukuran: randomBetween(100, 500) * 1024,
            },
          ],
        },
      },
    });
    disetujuiProposals.push(p);
    await notify(
      pengusul.id,
      "proposal_disetujui",
      "Proposal Disetujui! 🎉",
      `Selamat! Proposal "${judul.slice(0, 60)}..." telah disetujui.`,
      p.id,
      notifSudahDibaca,
    );
    await logActivity(
      ketuaLppm.id,
      "UPDATE_PROPOSAL_STATUS",
      p.id,
      `Proposal disetujui`,
    );
    await logActivity(
      pengusul.id,
      "UPLOAD_LAPORAN",
      p.id,
      `Upload laporan kemajuan`,
    );
    console.log(`  ✔ [disetujui] ${judul.slice(0, 55)}...`);
  }

  // ── DITOLAK ───────────────────────────────────────────────────────────────
  const ditolakProposals = [];
  for (let i = 0; i < 2; i++) {
    const pengusul = mahasiswas[i + 4];
    const judul = JUDUL_PENELITIAN[i + 7];
    const rv = reviewers[(i + 2) % reviewers.length];
    const nr = String(randomBetween(1, 2));
    const nm = String(randomBetween(1, 2));
    const na = String(randomBetween(1, 3));
    const nl = String(randomBetween(1, 2));
    const p = await prisma.proposal.create({
      data: {
        judul,
        abstrak: ABSTRAK_TEMPLATE(judul, "penelitian"),
        jenis: "penelitian",
        status: "ditolak",
        anggaran: randomBetween(5, 15) * 1_000_000,
        catatanRevisi: "Proposal tidak memenuhi kriteria minimum penilaian.",
        pengusulId: pengusul.id,
        periodeId: periodes[2].id,
        dokumenUrl: `https://drive.google.com/file/d/ditolak_${i + 1}/view`,
        submittedAt: daysAgo(randomBetween(45, 60)),
        reviewerTugasan: { create: [{ reviewerId: rv.id }] },
        reviews: {
          create: [
            {
              reviewerId: rv.id,
              nilaiRelevansi: nr,
              nilaiMetodologi: nm,
              nilaiAnggaran: na,
              nilaiLuaran: nl,
              catatan:
                "Metodologi tidak jelas dan anggaran tidak proporsional.",
              rekomendasi: "ditolak",
              isDone: true,
            },
          ],
        },
      },
    });
    ditolakProposals.push(p);
    await notify(
      pengusul.id,
      "proposal_ditolak",
      "Proposal Tidak Disetujui",
      `Mohon maaf, proposal "${judul.slice(0, 60)}..." tidak dapat disetujui.`,
      p.id,
      true,
    );
    await logActivity(
      ketuaLppm.id,
      "UPDATE_PROPOSAL_STATUS",
      p.id,
      `Proposal ditolak`,
    );
    console.log(`  ✔ [ditolak] ${judul.slice(0, 55)}...`);
  }

  // ── 11. Laporan Harian ────────────────────────────────────────────────────
  // Hanya mahasiswa dengan statusUndangan = "diterima" yang bisa mengisi laporan harian.
  // Target: proposal disetujui (semua anggota = diterima) + proposal revisi + review (yg diterima)
  console.log("\n📝 Membuat laporan harian...");

  let totalLaporanHarian = 0;

  /**
   * Helper: buat satu LaporanHarian dengan distribusi dokumen realistis.
   *
   * Mode berdasarkan (globalIndex % 3):
   *   0 → linkGdrive saja          — mahasiswa simpan di Google Drive, tidak upload file
   *   1 → blob + metadata           — mahasiswa upload file langsung ke sistem
   *   2 → blob + metadata + Gdrive  — upload file DAN cantumkan link Gdrive (paling lengkap)
   */
  const buatLaporanHarian = async (
    proposalId: number,
    userId: number,
    hariLalu: number,
    globalIndex: number,
    mhsName: string,
  ) => {
    const mode = globalIndex % 3;
    const namaFile = NAMA_FILE_LAPORAN[globalIndex % NAMA_FILE_LAPORAN.length];
    const fakeBlob = makeFakePdfBlob(
      `${mhsName} - proposal #${proposalId} - entri ${globalIndex}`,
    );
    const gdrive = `https://drive.google.com/drive/folders/laporan_${proposalId}_${userId}_${globalIndex}`;

    await prisma.laporanHarian.create({
      data: {
        proposalId,
        userId,
        tanggal: daysAgo(hariLalu),
        kegiatan: pickRandom(KEGIATAN_LAPORAN),

        // mode 0: hanya link Gdrive, tidak ada file upload
        linkGdrive: mode === 0 ? gdrive : mode === 2 ? gdrive : null,

        // mode 1 & 2: ada file yang di-upload (blob + metadata)
        dokumenNama: mode !== 0 ? namaFile : null,
        dokumenMime: mode !== 0 ? "application/pdf" : null,
        dokumenUkuran: mode !== 0 ? fakeBlob.length : null,
        dokumenBlob: mode !== 0 ? fakeBlob as unknown as Uint8Array<ArrayBuffer> : null,
      },
    });
  };

  let globalIdx = 0;

  // ── Laporan harian: proposal DISETUJUI (data paling lengkap, 3–5 per mahasiswa) ──
  for (let pi = 0; pi < disetujuiProposals.length; pi++) {
    const proposal = disetujuiProposals[pi];
    const anggotaList = [
      mahasiswas[pi % mahasiswas.length],
      mahasiswas[(pi + 1) % mahasiswas.length],
    ];

    for (const mhs of anggotaList) {
      const jumlahLaporan = randomBetween(3, 5);
      for (let k = 0; k < jumlahLaporan; k++) {
        await buatLaporanHarian(
          proposal.id,
          mhs.id,
          randomBetween(2, 28),
          globalIdx++,
          mhs.name,
        );
        totalLaporanHarian++;
      }
      await notify(
        ketuaLppm.id,
        "laporan_diunggah",
        "Laporan Harian Baru",
        `${mhs.name} mengunggah laporan harian untuk proposal "${proposal.judul.slice(0, 50)}..."`,
        proposal.id,
      );
      await logActivity(
        mhs.id,
        "UPLOAD_LAPORAN_HARIAN",
        proposal.id,
        `Mengunggah laporan harian`,
      );
    }
    console.log(`  ✔ Laporan harian [disetujui] #${proposal.id}`);
  }

  // ── Laporan harian: proposal REVISI (1–3 per mahasiswa) ──────────────────
  for (let pi = 0; pi < revisiProposals.length; pi++) {
    const proposal = revisiProposals[pi];
    const mhs = mahasiswas[(pi + 3) % mahasiswas.length];
    const jumlahLaporan = randomBetween(1, 3);
    for (let k = 0; k < jumlahLaporan; k++) {
      await buatLaporanHarian(
        proposal.id,
        mhs.id,
        randomBetween(1, 15),
        globalIdx++,
        mhs.name,
      );
      totalLaporanHarian++;
    }
    await logActivity(
      mhs.id,
      "UPLOAD_LAPORAN_HARIAN",
      proposal.id,
      `Mengunggah laporan harian`,
    );
    console.log(`  ✔ Laporan harian [revisi] #${proposal.id}`);
  }

  // ── Laporan harian: proposal REVIEW (hanya anggota statusUndangan=diterima: i=0,2) ─
  for (let pi = 0; pi < reviewProposals.length; pi++) {
    if (pi % 2 !== 0) continue; // skip yang pending/ditolak
    const proposal = reviewProposals[pi];
    const mhs = mahasiswas[(pi + 2) % mahasiswas.length];
    const jumlahLaporan = randomBetween(1, 2);
    for (let k = 0; k < jumlahLaporan; k++) {
      await buatLaporanHarian(
        proposal.id,
        mhs.id,
        randomBetween(3, 10),
        globalIdx++,
        mhs.name,
      );
      totalLaporanHarian++;
    }
    await logActivity(
      mhs.id,
      "UPLOAD_LAPORAN_HARIAN",
      proposal.id,
      `Mengunggah laporan harian`,
    );
    console.log(`  ✔ Laporan harian [review] #${proposal.id}`);
  }

  // ── 12. Deletion Request Periode ──────────────────────────────────────────
  // Model PeriodeDeletionRequest belum pernah diisi seed sebelumnya.
  // Ditambahkan agar endpoint terkait (ajukan/setujui/batalkan penghapusan
  // periode) punya data nyata untuk diuji, mencakup keempat status enum.
  console.log("\n🗑️  Membuat deletion request periode...");

  // pending: admin baru saja mengajukan penghapusan periode lama, menunggu
  // persetujuan ketua LPPM (alur silang: admin ↔ ketua_lppm saling approve)
  await prisma.periodeDeletionRequest.create({
    data: {
      periodeId: periodes[2].id, // "Penelitian Semester Genap 2025" (tidak aktif)
      requesterId: admin.id,
      status: "pending",
      expiresAt: daysFromNow(7),
    },
  });
  await notify(
    ketuaLppm.id,
    "deletion_request",
    "Permintaan Hapus Periode",
    `${admin.name} mengajukan penghapusan periode "${periodes[2].nama}".`,
  );
  console.log(`  ✔ [pending]   ${periodes[2].nama}`);

  // approved: ketua LPPM sudah menyetujui permintaan admin sebelumnya
  await prisma.periodeDeletionRequest.create({
    data: {
      periodeId: periodes[3].id, // "Pengabdian Semester Genap 2025" (tidak aktif)
      requesterId: admin.id,
      approverId: ketuaLppm.id,
      status: "approved",
      expiresAt: daysAgo(1),
    },
  });
  await notify(
    admin.id,
    "deletion_approved",
    "Permintaan Hapus Periode Disetujui",
    `${ketuaLppm.name} menyetujui penghapusan periode "${periodes[3].nama}".`,
    undefined,
    true,
  );
  console.log(`  ✔ [approved]  ${periodes[3].nama}`);

  // cancelled: ketua LPPM sendiri yang mengajukan, lalu membatalkannya sendiri
  await prisma.periodeDeletionRequest.create({
    data: {
      periodeId: periodeMasaDepan.id,
      requesterId: ketuaLppm.id,
      approverId: ketuaLppm.id,
      status: "cancelled",
      expiresAt: daysAgo(2),
    },
  });
  await notify(
    admin.id,
    "deletion_cancelled",
    "Permintaan Hapus Periode Dibatalkan",
    `${ketuaLppm.name} membatalkan permintaan penghapusan periode "${periodeMasaDepan.nama}".`,
    undefined,
    true,
  );
  console.log(`  ✔ [cancelled] ${periodeMasaDepan.nama}`);

  // expired: wakil ketua mengajukan, tidak ada yang merespon sampai lewat masa berlaku
  await prisma.periodeDeletionRequest.create({
    data: {
      periodeId: periodeLama.id,
      requesterId: wakilKetuaLppm.id,
      status: "expired",
      expiresAt: daysAgo(10),
    },
  });
  console.log(`  ✔ [expired]   ${periodeLama.nama}`);

  // ── 13. Notifikasi & log tambahan ─────────────────────────────────────────
  console.log("\n🔔 Notifikasi & activity log tambahan...");
  for (let i = 0; i < 3; i++) {
    await notify(
      dosens[i].id,
      "proposal_diajukan",
      "Info: Periode Baru Dibuka",
      "Periode penelitian semester ganjil 2025 telah dibuka. Segera ajukan proposal Anda.",
    );
  }
  await logActivity(admin.id, "LOGIN", undefined, "Login berhasil");
  await logActivity(ketuaLppm.id, "LOGIN", undefined, "Login berhasil");
  await logActivity(
    ketuaLppm.id,
    "CREATE_PERIODE",
    undefined,
    "Membuat periode baru",
  );
  await logActivity(wakilKetuaLppm.id, "LOGIN", undefined, "Login berhasil");
  for (const d of dosens.slice(0, 4)) {
    await logActivity(d.id, "LOGIN", undefined, "Login berhasil");
  }
  console.log("  ✔ Selesai");

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalProposal =
    draftProposals.length +
    diajukanProposals.length +
    reviewProposals.length +
    revisiProposals.length +
    disetujuiProposals.length +
    ditolakProposals.length;

  console.log("\n" + "═".repeat(60));
  console.log("✅  SEEDING SELESAI");
  console.log("═".repeat(60));
  console.log(`\n📊 Ringkasan:`);
  console.log(`  👤 Users         : 31 total`);
  console.log(`     - admin@lppm.dev           / admin123456`);
  console.log(`     - ketua@lppm.dev           / ketua123456`);
  console.log(`     - wakil.ketua@lppm.dev     / wakil123456   (+dosen)`);
  console.log(`     - reviewer1-4@lppm.dev     / reviewer123`);
  console.log(`     - pending.reviewer@lppm.dev/ pending123    (pending)`);
  console.log(`     - dosen1-12@lppm.dev       / dosen123456`);
  console.log(`     - mahasiswa1-8@lppm.dev    / mhs1234567`);
  console.log(`     - pending.dosen@lppm.dev   / pending123    (pending)`);
  console.log(`     - rejected.mhs@lppm.dev    / rejected123   (rejected)`);
  console.log(`\n  📅 Periode       : ${periodes.length} (2 aktif, 1 belum mulai)`);
  console.log(`\n  📄 Proposals     : ${totalProposal} total`);
  console.log(
    `     draft=${draftProposals.length} diajukan=${diajukanProposals.length} review=${reviewProposals.length} revisi=${revisiProposals.length} disetujui=${disetujuiProposals.length} ditolak=${ditolakProposals.length}`,
  );
  console.log(
    `\n  ⭐ Reviews       : ${disetujuiProposals.length + ditolakProposals.length} selesai, 1 draft-progress, 1 selesai-beda-pendapat`,
  );
  console.log(`  📋 Laporan       : ${disetujuiProposals.length + 2} file`);
  console.log(`  📝 Laporan Harian: ~${totalLaporanHarian} entri`);
  console.log(`     Mode distribusi dokumen (per globalIndex % 3):`);
  console.log(`       0 → linkGdrive saja       (tidak upload file)`);
  console.log(`       1 → blob PDF + metadata   (upload ke sistem)`);
  console.log(`       2 → blob PDF + Gdrive     (upload + link Gdrive)`);
  console.log(
    `     - statusUndangan "diterima" : disetujui (all), revisi (all), review (sebagian)`,
  );
  console.log(
    `     - statusUndangan "pending"  : diajukan (all, kecuali solo), review (sebagian)`,
  );
  console.log(
    `     - statusUndangan "ditolak"  : review (1 kasus — anggota menolak undangan)`,
  );
  console.log(`  🗑️  Deletion Req  : 4 (pending, approved, cancelled, expired)`);
  console.log(`  🔔 Notifikasi    : dibuat per event, campuran read/unread`);
  console.log(`  📝 Activity Logs : dibuat per aksi`);
  console.log("\n" + "═".repeat(60));
}

main()
  .catch((e) => {
    console.error("❌ Seeding gagal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
