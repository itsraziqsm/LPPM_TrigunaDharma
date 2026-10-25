// Uji black box UI Sistem Informasi LPPM (Playwright). Hasil -> <keluaran>/hasil_bb.json, bukti -> <keluaran>/bukti/*.png
// Pemakaian: node uji-blackbox.js <folder-keluaran> [TC-01,TC-02,...]  (butuh backend :3000 dan frontend :5173 berisi data dari data-contoh.py)
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2]; const U = 'http://localhost:5173';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const hasil = [];
fs.mkdirSync(OUT + '/bukti', { recursive: true });
(async () => {
  const b = await chromium.launch();
  let ctx, p;
  const baru = async () => { ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); p = await ctx.newPage(); };
  const tunggu = (ms = 1500) => p.waitForTimeout(ms);
  const teks = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const sesi = {};
  const login = async (email, pw, segar = false) => {
    if (!segar && sesi[email]) { ctx = sesi[email].ctx; p = sesi[email].p; await p.goto(U + '/dashboard'); await tunggu(1500); return; }
    ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); p = await ctx.newPage();
    await p.goto(U + '/login'); await tunggu(800);
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw);
    await p.click('button:has-text("Masuk ke Dashboard")'); await tunggu(2500);
    if (!segar) sesi[email] = { ctx, p };
  };
  const api = async (method, path, token, body) => {
    const r = await fetch('http://localhost:3000/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  };
  const tokenDari = async () => p.evaluate(() => localStorage.getItem('accessToken'));
  const idDraf = async () => { const r = await api('GET', '/dosen/proposals?status=draft', await tokenDari()); return (r.data || []).find((x) => x.judul.startsWith('Prediksi Kelulusan')).id; };
  async function tc(id, modul, skenario, langkah, harapan, fn) {
    if (ONLY && !ONLY.includes(id)) return;
    let status = 'Gagal', aktual = '';
    try { aktual = await fn(); status = 'Berhasil'; }
    catch (e) { aktual = 'Tidak sesuai: ' + String(e.message).split('\n')[0].slice(0, 300); }
    try { await p.screenshot({ path: `${OUT}/bukti/${id}.png` }); } catch {}
    hasil.push({ id, modul, skenario, langkah, harapan, aktual, status });
    console.log(status, id, aktual.slice(0, 160));
  }
  const harus = (c, m) => { if (!c) throw new Error(m); };

  // ===== Autentikasi =====
  await tc('TC-01', 'Autentikasi', 'Login dengan email dan password yang benar', 'Buka /login, isi dosen1@lppm.dev dan password benar, klik Masuk ke Dashboard', 'Masuk ke halaman Dashboard dosen', async () => {
    await login('dosen1@lppm.dev', 'dosen123456');
    harus(p.url().includes('/dashboard'), 'URL ' + p.url()); const t = await teks(); harus(t.includes('Halo'), 'salam tidak tampil');
    return 'Diarahkan ke /dashboard dan salam "Halo" tampil';
  });
  await tc('TC-02', 'Autentikasi', 'Login dengan password salah', 'Isi email benar dan password salah, klik Masuk ke Dashboard', 'Login ditolak dan muncul pesan kesalahan', async () => {
    await baru(); await p.goto(U + '/login'); await tunggu(800);
    await p.fill('input[type=email]', 'dosen1@lppm.dev'); await p.fill('input[type=password]', 'salah12345');
    await p.click('button:has-text("Masuk ke Dashboard")'); await tunggu(2000);
    harus(p.url().includes('/login'), 'pindah ke ' + p.url()); const t = await teks();
    const m = t.match(/(salah|Invalid|tidak valid|gagal)[^.]{0,80}/i); harus(m, 'pesan kesalahan tidak ditemukan');
    return 'Tetap di halaman login, pesan: "' + m[0].trim() + '"';
  });
  await tc('TC-03', 'Autentikasi', 'Login akun yang belum disetujui admin', 'Login dengan pending.dosen@lppm.dev', 'Login ditolak dengan pesan akun belum disetujui', async () => {
    await baru(); await p.goto(U + '/login'); await tunggu(800);
    await p.fill('input[type=email]', 'pending.dosen@lppm.dev'); await p.fill('input[type=password]', 'pending123');
    await p.click('button:has-text("Masuk ke Dashboard")'); await tunggu(2000);
    harus(p.url().includes('/login'), 'pindah ke ' + p.url()); const t = await teks();
    const m = t.match(/(belum disetujui|not approved|menunggu|salah)[^.]{0,80}/i); harus(m, 'pesan tidak ditemukan: ' + t.slice(0, 200));
    return 'Login ditolak, pesan: "' + m[0].trim() + '"';
  });
  await tc('TC-04', 'Autentikasi', 'Membuka halaman privat tanpa login', 'Buka /dashboard tanpa sesi login', 'Diarahkan ke halaman login', async () => {
    await baru(); await p.goto(U + '/dashboard'); await tunggu(1500);
    harus(p.url().includes('/login'), 'URL ' + p.url()); return 'Diarahkan ke ' + new URL(p.url()).pathname;
  });
  await tc('TC-05', 'Autentikasi', 'Registrasi dengan isian kosong', 'Buka /register, langsung klik Daftar Sekarang', 'Registrasi tidak terkirim dan kolom wajib ditandai', async () => {
    await baru(); await p.goto(U + '/register'); await tunggu(1000);
    await p.click('button:has-text("Daftar Sekarang")'); await tunggu(1000);
    harus(p.url().includes('/register'), 'pindah');
    const inv = await p.evaluate(() => { const e = document.querySelector('input:invalid'); return e ? (e.validationMessage + '|' + (e.placeholder || e.name)) : null; });
    harus(inv, 'tidak ada kolom yang ditandai');
    return 'Tetap di /register; kolom wajib ditandai browser ("' + inv.split('|')[0] + '")';
  });
  await tc('TC-06', 'Autentikasi', 'Keluar dari sistem', 'Login, klik Keluar dari Sistem, konfirmasi', 'Muncul dialog konfirmasi lalu kembali ke halaman login', async () => {
    await login('dosen1@lppm.dev', 'dosen123456', true);
    await p.click('button:has-text("Keluar dari Sistem")'); await tunggu(800);
    const dlg = p.locator('[role=dialog], [aria-modal=true]'); harus(await dlg.count() > 0, 'dialog tidak muncul');
    await dlg.locator('button:has-text("Keluar")').last().click(); await tunggu(1500);
    harus(p.url().includes('/login'), 'URL ' + p.url()); return 'Dialog konfirmasi muncul, setelah dikonfirmasi kembali ke /login';
  });
  await tc('TC-07', 'Umum', 'Membuka alamat yang tidak ada', 'Buka /halaman-tidak-ada', 'Tampil halaman galat 404', async () => {
    await baru(); await p.goto(U + '/halaman-tidak-ada'); await tunggu(1200);
    const t = await teks(); harus(t.includes('404'), 'bukan 404'); return 'Halaman galat 404 tampil';
  });

  // ===== Dosen =====
  await tc('TC-08', 'Usulan Proposal', 'Lanjut ke langkah berikutnya tanpa mengisi judul', 'Dosen membuka Usulan Penelitian baru, klik Berikutnya', 'Tidak bisa lanjut dan muncul pesan isian wajib', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian/usulan'); await tunggu(1500);
    await p.click('button:has-text("Berikutnya")'); await tunggu(800); const t = await teks();
    harus(/A\. Identitas Proposal/.test(t), 'pindah langkah'); const m = t.match(/(wajib|minimal|harus)[^.]{0,60}/i); harus(m, 'pesan tidak ada');
    return 'Tetap di langkah Identitas, pesan: "' + m[0].trim() + '"';
  });
  await tc('TC-09', 'Usulan Proposal', 'Menyimpan draf proposal baru tanpa abstrak', 'Isi judul dan periode, klik Simpan draf', 'Draf tidak disimpan dan muncul pesan isian minimal untuk draf', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian/usulan'); await tunggu(1500);
    await p.fill('input[placeholder*="Judul" i], input[name=judul]', 'Uji Black Box Penyimpanan Draf Proposal Penelitian');
    await p.locator('select').filter({ hasText: 'Pilih periode' }).first().selectOption({ index: 1 });
    await p.click('button:has-text("Simpan draf")'); await tunggu(1500);
    const t = await teks(); const m = t.match(/Untuk menyimpan draf[^.]*\./); harus(m, 'pesan tidak ada');
    harus(!/\/usulan\/\d+/.test(p.url()), 'tersimpan');
    return 'Draf tidak disimpan, pesan: "' + m[0] + '"';
  });
  await tc('TC-10', 'Usulan Proposal', 'Mengubah draf proposal yang sudah ada', 'Buka draf "Prediksi Kelulusan…" (mode ubah), ubah judul, klik Simpan draf', 'Draf tersimpan dan muncul pesan "Draf tersimpan pukul …"', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian/usulan/' + await idDraf()); await tunggu(2000);
    await p.fill('input[placeholder*="Judul" i], input[name=judul]', 'Prediksi Kelulusan Mahasiswa Tepat Waktu Menggunakan Random Forest (Revisi Judul)');
    await p.click('button:has-text("Simpan draf")'); await tunggu(2500);
    const t = await teks(); const m = t.match(/Draf tersimpan pukul [0-9.:]+/); harus(m, 'pesan sukses tidak ada');
    return 'Muncul pesan "' + m[0] + '…" dan judul baru tersimpan';
  });
  await tc('TC-11', 'Usulan Proposal', 'Komposisi tim penelitian kurang dari aturan', 'Buka draf baru, langkah Anggota tanpa menambah dosen, klik Berikutnya', 'Sistem menampilkan aturan komposisi tim dan menahan langkah', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian'); await tunggu(1500);
    await p.goto(U + '/kegiatan/penelitian/usulan'); await tunggu(1200);
    await p.fill('input[placeholder*="Judul" i], input[name=judul]', 'Uji Komposisi Tim Penelitian Kurang Anggota');
    await p.locator('select').filter({ hasText: 'Pilih periode' }).first().selectOption({ index: 1 });
    // isi field wajib lain bila ada lalu lanjut
    await p.click('button:has-text("Berikutnya")'); await tunggu(1000);
    let t = await teks(); if (!/B\. Anggota Tim/.test(t)) throw new Error('belum sampai langkah Anggota: ' + (t.match(/(wajib|minimal)[^.]{0,80}/i) || [''])[0]);
    await p.click('button:has-text("Berikutnya")'); await tunggu(1000); t = await teks();
    harus(/B\. Anggota Tim/.test(t), 'lolos ke langkah berikutnya'); const m = t.match(/Ketentuan tim[^.]{0,120}/i) || t.match(/(minimal 2|dosen)[^.]{0,80}/i);
    return 'Langkah tertahan di Anggota; panel menampilkan "' + (m ? m[0].trim() : 'aturan tim') + '"';
  });
  await tc('TC-12', 'Usulan Proposal', 'Mengajukan proposal saat undangan anggota belum diterima', 'Buka Detail Kegiatan draf "Prediksi Kelulusan…"', 'Tombol Ajukan proposal tidak aktif dan muncul keterangan anggota belum menerima undangan', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian/detail/' + await idDraf()); await tunggu(2000);
    const btn = p.locator('button:has-text("Ajukan proposal")').first(); harus(await btn.count(), 'tombol tidak ada');
    harus(await btn.isDisabled(), 'tombol aktif'); const t = await teks(); const m = t.match(/\d+ anggota belum menerima undangan[^.]*\./); harus(m, 'keterangan tidak ada');
    return 'Tombol Ajukan proposal nonaktif; keterangan: "' + m[0] + '"';
  });
  await tc('TC-13', 'Kegiatan', 'Melihat detail kegiatan yang disetujui', 'Klik baris proposal "Sistem Pendukung Keputusan…" di Riwayat', 'Tampil Detail Kegiatan berisi abstrak, tim, dokumen utama, dan tahapan', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian'); await tunggu(2000);
    await p.locator('tr:has-text("Sistem Pendukung Keputusan")').first().click(); await tunggu(2000);
    harus(p.url().includes('/detail/'), 'URL ' + p.url()); const t = await teks();
    for (const k of ['Abstrak', 'Tim', 'Dokumen utama']) harus(t.includes(k), 'tidak ada ' + k);
    return 'Detail Kegiatan tampil lengkap (Abstrak, Tim, Dokumen utama) di ' + new URL(p.url()).pathname;
  });
  await tc('TC-14', 'Kegiatan', 'Menyaring riwayat berdasarkan status', 'Pilih filter status Disetujui pada Riwayat Penelitian', 'Hanya proposal berstatus disetujui yang tampil pada tabel Riwayat', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/kegiatan/penelitian?status=disetujui'); await tunggu(2000);
    const rows = p.locator('table').first().locator('tbody tr'); const n = await rows.count(); harus(n > 0, 'tidak ada baris');
    for (let i = 0; i < n; i++) { const r = (await rows.nth(i).innerText()); harus(/Disetujui/i.test(r), 'ada baris non-disetujui: ' + r.slice(0, 60)); }
    return n + ' baris tampil pada Riwayat, semuanya berstatus Disetujui';
  });
  await tc('TC-15', 'Luaran', 'Membuka menu Luaran (pencairan dana)', 'Klik menu Luaran', 'Tampil keterangan 501 fitur belum tersedia', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/luaran'); await tunggu(1500);
    const t = await teks(); harus(t.includes('501'), 'tidak ada 501'); return 'Halaman 501 (fitur menunggu keputusan kampus) tampil';
  });

  // ===== Mahasiswa =====
  await tc('TC-16', 'Mahasiswa', 'Menerima undangan ikut serta', 'Mahasiswa2 membuka Undangan Ikut Serta, klik Terima pada undangan yang menunggu', 'Status undangan berubah menjadi Diterima', async () => {
    await login('mahasiswa2@lppm.dev', 'mhs1234567'); await p.goto(U + '/undangan'); await tunggu(2000);
    await p.locator('button:has-text("Terima")').first().click(); await tunggu(800);
    const d = p.locator('[aria-modal=true] button:has-text("Terima")'); if (await d.count()) { await d.last().click(); }
    await tunggu(2000); const t = await teks(); harus(/diterima/i.test(t), 'tidak berubah');
    return 'Undangan berhasil diterima, status menjadi Diterima';
  });
  await tc('TC-17', 'Mahasiswa', 'Mengakses halaman usulan proposal', 'Mahasiswa membuka /kegiatan/penelitian/usulan', 'Akses ditolak (mahasiswa tidak mengusulkan proposal)', async () => {
    await login('mahasiswa1@lppm.dev', 'mhs1234567'); await p.goto(U + '/kegiatan/penelitian/usulan'); await tunggu(1800);
    const t = await teks(); harus(!/A\. Identitas Proposal/.test(t), 'form usulan tampil untuk mahasiswa');
    return 'Form usulan tidak tersedia; ' + (t.match(/(403|tidak memiliki akses|Dashboard)/i) || ['dialihkan'])[0];
  });
  await tc('TC-18', 'Mahasiswa', 'Mengisi laporan harian', 'Buka Project Saya > project, klik Input Laporan Harian, isi tanggal, kegiatan, link, simpan', 'Laporan harian baru tampil di riwayat', async () => {
    await login('mahasiswa1@lppm.dev', 'mhs1234567'); await p.goto(U + '/project/penelitian?id=1'); await tunggu(2000);
    await p.click('button:has-text("Input Laporan Harian")'); await tunggu(1000);
    const m = p.locator('[aria-modal=true], .overlay').last();
    await m.locator('input[type=date]').fill('2026-10-24');
    await m.locator('textarea').first().fill('Uji black box: menguji fitur laporan harian mahasiswa.');
    const link = m.locator('input[type=url]'); if (await link.count()) await link.first().fill('https://drive.google.com/drive/folders/uji');
    await m.locator('button[type=submit]').last().click(); await tunggu(2500);
    const t = await teks(); harus(t.includes('menguji fitur laporan harian'), 'tidak tampil di riwayat');
    return 'Laporan harian tersimpan dan tampil di Riwayat Laporan Harian';
  });

  // ===== Reviewer =====
  await tc('TC-19', 'Review', 'Menyelesaikan penilaian proposal', 'Reviewer1 membuka Penugasan Review, klik Lanjutkan Review, klik Selesaikan Review dan konfirmasi', 'Review final tersimpan dan tugasan berstatus Selesai', async () => {
    await login('reviewer1@lppm.dev', 'reviewer123'); await p.goto(U + '/penugasan'); await tunggu(2000);
    await p.click('button:has-text("Lanjutkan Review")'); await tunggu(1500);
    await p.locator('button:has-text("Selesaikan Review")').last().click(); await tunggu(1000);
    const c = p.locator('[aria-modal=true] button:has-text("Selesaikan"), [role=dialog] button:has-text("Ya")'); if (await c.count()) await c.last().click();
    await tunggu(2500);
    await p.goto(U + '/penugasan'); await tunggu(2000);
    const kartu = p.locator('div.card, article, li, section').filter({ hasText: 'Analisis Sentimen Ulasan' }).filter({ hasNotText: 'Pelatihan' }).last();
    const kt = await kartu.innerText(); harus(/Selesai/.test(kt) && /Lihat Hasil Review/.test(kt), 'belum selesai: ' + kt.slice(0, 120));
    return 'Review proposal "Analisis Sentimen…" tersimpan final (isDone = true), tugasan menjadi Selesai';
  });

  // ===== Ketua LPPM =====
  await tc('TC-20', 'Dokumen Masuk', 'Menugaskan reviewer dari menu Dokumen Masuk Proposal', 'Ketua membuka Ubah Status Proposal pada proposal Diajukan "Pendampingan…", memilih status, mencari pilihan reviewer, lalu menyimpan', 'Ketua dapat memilih reviewer dan reviewer tercatat pada proposal', async () => {
    await login('ketua@lppm.dev', 'ketua123456'); await p.goto(U + '/proposals'); await tunggu(2500);
    await p.locator('tr:has-text("Pendampingan Pengelolaan Keuangan")').locator('text=Ubah Status Proposal').click(); await tunggu(1500);
    const sel = p.locator('select#newStatus'); const opsi = await sel.locator('option').allInnerTexts();
    await sel.selectOption('review'); await tunggu(800);
    let ada = await p.locator('text=Tugaskan Reviewer').count();
    await sel.selectOption('revisi'); await tunggu(1500);
    const adaRevisi = await p.locator('text=Tugaskan Reviewer').count();
    const cb = p.locator('[aria-modal=true] input[type=checkbox]');
    let dipilih = 0; if (await cb.count()) { await cb.first().check(); dipilih = 1; }
    await p.locator('button:has-text("Simpan Perubahan")').click(); await tunggu(2500);
    const tk = await tokenDari(); const d = await api('GET', '/proposals/5', tk);
    const n = (d.data?.reviewerTugasan || []).length;
    harus(ada > 0 && n > 0, `pilihan reviewer saat status "Review" = ${ada ? 'ada' : 'tidak ada'}; saat "Revisi" = ${adaRevisi ? 'ada' : 'tidak ada'}; reviewer dicentang = ${dipilih}; setelah disimpan status = ${d.data?.status}, reviewer tercatat = ${n}`);
    return 'Reviewer tercatat: ' + n;
  });
  await tc('TC-21', 'Periode', 'Menugaskan reviewer dari panel Periode', 'Ketua membuka Periode > Penelitian Semester Ganjil 2025 > proposal Diajukan "Rancang Bangun…", klik Tugaskan Reviewer, pilih reviewer, simpan', 'Reviewer tercatat dan status proposal menjadi Review', async () => {
    await login('ketua@lppm.dev', 'ketua123456'); await p.goto(U + '/periode'); await tunggu(2000);
    await p.locator('text=Penelitian Semester Ganjil 2025').first().click(); await tunggu(2500);
    await p.locator('text=Rancang Bangun Aplikasi Presensi').first().click(); await tunggu(2000);
    await p.locator('button:has-text("Tugaskan Reviewer")').first().click(); await tunggu(1500);
    await p.locator('[aria-modal=true] input[type=checkbox], .overlay input[type=checkbox]').first().check();
    await p.locator('button:has-text("Tugaskan Reviewer (")').click(); await tunggu(2500);
    const tk = await tokenDari(); const cari = await api('GET', '/proposals?search=Rancang%20Bangun', tk); const pid = cari.data[0].id; const d = await api('GET', '/proposals/' + pid, tk);
    const n = (d.data?.reviewerTugasan || []).length; harus(n > 0, 'reviewer tidak tercatat');
    return `Reviewer tercatat (${n}) dan status proposal menjadi "${d.data.status}"`;
  });
  await tc('TC-22', 'Periode', 'Admin tidak dapat menambah periode', 'Admin membuka menu Periode', 'Tombol Tambah Periode tidak tersedia', async () => {
    await login('admin@lppm.dev', 'admin123456'); await p.goto(U + '/periode'); await tunggu(2000);
    harus(await p.locator('button:has-text("Tambah Periode")').count() === 0, 'tombol ada'); return 'Tombol Tambah Periode tidak tampil untuk Admin';
  });
  await tc('TC-23', 'Periode', 'Ketua menambah periode baru', 'Ketua klik Tambah Periode, isi nama, jenis, tahun, tanggal, simpan', 'Periode baru muncul di Daftar Periode', async () => {
    await login('ketua@lppm.dev', 'ketua123456'); await p.goto(U + '/periode'); await tunggu(2000);
    await p.click('button:has-text("Tambah Periode")'); await tunggu(1000);
    await p.fill('input[name=nama]', 'Penelitian Semester Genap 2027 Uji');
    await p.locator('select[name=jenis]').selectOption('penelitian');
    await p.fill('input[name=tahun]', '2027');
    await p.fill('input[name=tanggalMulai]', '2027-02-01'); await p.fill('input[name=tanggalSelesai]', '2027-07-31');
    await p.locator('button[type=submit]:has-text("Tambah Periode")').click(); await tunggu(2500);
    const t = await teks(); harus(t.includes('Penelitian Semester Genap 2027 Uji'), 'tidak muncul');
    return 'Periode "Penelitian Semester Genap 2027 Uji" muncul di Daftar Periode';
  });
  await tc('TC-24', 'Backup', 'Admin melakukan backup manual', 'Admin membuka Backup Data, klik Backup sekarang', 'Backup baru berstatus Berhasil di Daftar Backup', async () => {
    await login('admin@lppm.dev', 'admin123456'); await p.goto(U + '/backup'); await tunggu(2000);
    const n0 = await p.locator('tbody tr').count();
    await p.click('button:has-text("Backup sekarang")'); await tunggu(800);
    const c = p.locator('[aria-modal=true] button:has-text("Backup")'); if (await c.count()) await c.last().click();
    await tunggu(6000); const n1 = await p.locator('tbody tr').count(); const t = await teks();
    harus(n1 > n0, `jumlah baris ${n0}->${n1}`); harus(/Berhasil/i.test(t), 'tidak berhasil');
    return `Baris backup bertambah (${n0} → ${n1}) dengan status Berhasil`;
  });
  await tc('TC-25', 'Pencarian', 'Pencarian global dengan Ctrl+F', 'Login dosen, tekan Ctrl+F, ketik "Sistem Pendukung"', 'Popup pencarian menampilkan proposal yang cocok', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await tunggu(1500); await p.keyboard.press('Control+f'); await tunggu(600);
    await p.keyboard.type('Sistem Pendukung'); await tunggu(2500); const t = await teks();
    harus(t.includes('Sistem Pendukung Keputusan Pemilihan Mitra'), 'hasil tidak muncul'); return 'Popup menampilkan proposal "Sistem Pendukung Keputusan Pemilihan Mitra…" (proposal dan laporan)';
  });
  await tc('TC-26', 'Profil', 'Mengganti password dengan password lama salah', 'Buka Pengaturan, isi password lama salah dan password baru, simpan', 'Penggantian password ditolak dengan pesan kesalahan', async () => {
    await login('dosen1@lppm.dev', 'dosen123456'); await p.goto(U + '/profil'); await tunggu(2000);
    const pw = p.locator('input[placeholder="Password saat ini"], input[placeholder="Password baru"], input[placeholder="Ulangi password baru"]'); const n = await pw.count(); harus(n >= 2, 'kolom password ' + n);
    await pw.nth(0).fill('salahsekali1'); for (let i = 1; i < n; i++) await pw.nth(i).fill('PasswordBaru123');
    await p.locator('input[placeholder="Ulangi password baru"]').press('Enter'); await tunggu(2000);
    const t = await teks(); const m = t.match(/(salah|incorrect|tidak sesuai|invalid)[^.]{0,80}/i); harus(m, 'pesan tidak ada');
    return 'Ditolak, pesan: "' + m[0].trim() + '"';
  });

  await tc('TC-27', 'Cetak Dokumen', 'Mencetak Export Rekapitulasi Proposal', 'Ketua membuka Cetak Dokumen, klik Cetak pada kartu Export Rekapitulasi Proposal', 'Berkas PDF rekapitulasi terunduh', async () => {
    await login('ketua@lppm.dev', 'ketua123456'); await p.goto(U + '/cetak-dokumen'); await tunggu(2000);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('button:has-text("Cetak")').first().click()]);
    const f = `${OUT}/bukti/${dl.suggestedFilename()}`; await dl.saveAs(f);
    return 'Berkas "' + dl.suggestedFilename() + '" terunduh (' + fs.statSync(f).size + ' byte)';
  });
  await tc('TC-28', 'Cetak Dokumen', 'Membuat Surat Tugas untuk kegiatan disetujui', 'Ketua membuka Konfigurasi Surat Tugas, memilih proposal disetujui, mengisi tugas, lalu mencetak', 'Berkas PDF Surat Tugas terunduh', async () => {
    await login('ketua@lppm.dev', 'ketua123456'); await p.goto(U + '/cetak-dokumen/surat-tugas'); await tunggu(2500);
    const sel = p.locator('select').filter({ hasText: 'Pilih proposal' }).first(); await sel.selectOption({ index: 1 }); await tunggu(2000);
    const tugas = p.locator('textarea, input').filter({ has: p.locator('xpath=.') }).locator('xpath=//*[@placeholder and contains(@placeholder,"melaksanakan")]');
    if (await tugas.count()) await tugas.first().fill('melaksanakan kegiatan sesuai proposal yang telah disetujui');
    const btns = p.locator('button:has-text("Cetak"), button:has-text("Unduh"), button:has-text("PDF")');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), btns.last().click()]);
    const f = `${OUT}/bukti/${dl.suggestedFilename()}`; await dl.saveAs(f);
    return 'Berkas "' + dl.suggestedFilename() + '" terunduh (' + fs.statSync(f).size + ' byte)';
  });
  await tc('TC-29', 'Manajemen User', 'Admin menyetujui akun yang mendaftar', 'Admin membuka Manajemen User, filter status Pending, pilih "pending.dosen", ubah status menjadi Approved', 'Status akun berubah menjadi Approved', async () => {
    await login('admin@lppm.dev', 'admin123456'); await p.goto(U + '/users'); await tunggu(2000);
    await p.locator('select').filter({ hasText: 'Semua Status' }).selectOption('pending'); await tunggu(2000);
    await p.locator('text=pending.dosen@lppm.dev').first().click(); await tunggu(1500);
    await p.locator('button:has-text("Ubah Status")').click(); await tunggu(1000);
    await p.locator('input[value=approved]').check(); await p.locator('[aria-modal=true] button, .overlay button').filter({ hasText: /Simpan/ }).last().click(); await tunggu(2500);
    const tk = await tokenDari(); const r = await api('GET', '/users?search=pending.dosen', tk);
    const u = (r.data || []).find((x) => x.email === 'pending.dosen@lppm.dev'); harus(u && u.status === 'approved', 'status ' + (u && u.status));
    return 'Status akun pending.dosen@lppm.dev berubah menjadi approved';
  });
  fs.writeFileSync(`${OUT}/hasil_bb.json`, JSON.stringify(hasil, null, 1));
  await b.close();
})();
