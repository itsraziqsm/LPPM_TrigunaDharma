import json, urllib.request, urllib.error, uuid
B="http://localhost:3000/api/v1"
def req(m,p,t=None,b=None,raw=None,ct=None):
    h={"X-Forwarded-For":"10.9.%d.%d"%(uuid.uuid4().int%250,uuid.uuid4().int%250)}
    if t:h["Authorization"]="Bearer "+t
    d=None
    if b is not None: d=json.dumps(b).encode(); h["Content-Type"]="application/json"
    if raw is not None: d=raw; h["Content-Type"]=ct
    r=urllib.request.Request(B+p,data=d,method=m,headers=h)
    try: x=urllib.request.urlopen(r); return x.status,json.loads(x.read() or b'null')
    except urllib.error.HTTPError as e:
        c=e.read(); 
        try: return e.code,json.loads(c)
        except Exception: return e.code,c
def login(e,p): return req("POST","/auth/login",b={"email":e,"password":p})[1]["data"]
U={}
for e,p in [("admin","admin123456"),("ketua","ketua123456")]+[("dosen%d"%i,"dosen123456") for i in range(1,7)]+[("mahasiswa%d"%i,"mhs1234567") for i in range(1,5)]+[("reviewer%d"%i,"reviewer123") for i in range(1,4)]:
    d=login(e+"@lppm.dev",p); U[e]=(d["accessToken"],d["user"]["id"])
T=lambda k:U[k][0]; I=lambda k:U[k][1]
per=req("GET","/periode",T("admin"))[1]["data"]
pen=[p for p in per if p["jenis"]=="penelitian" and p["isAktif"]][0]["id"]
pgb=[p for p in per if p["jenis"]=="pengabdian" and p["isAktif"]][0]["id"]
AB="Penelitian ini bertujuan membangun model yang membantu proses pengambilan keputusan secara objektif dengan memanfaatkan data historis serta metode komputasi yang telah teruji, sehingga hasilnya dapat diterapkan oleh mitra dan institusi."
def pdf():
    c=b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    bd="----b"+uuid.uuid4().hex
    body=(f"--{bd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"proposal.pdf\"\r\nContent-Type: application/pdf\r\n\r\n").encode()+c+f"\r\n--{bd}--\r\n".encode()
    return body,"multipart/form-data; boundary="+bd
plans=[
 ("dosen1","penelitian","Sistem Pendukung Keputusan Pemilihan Mitra UMKM Menggunakan Metode AHP",["dosen2","dosen3"],["mahasiswa1"],"disetujui"),
 ("dosen2","penelitian","Klasifikasi Penyakit Daun Padi Berbasis Convolutional Neural Network",["dosen1","dosen4"],["mahasiswa2"],"disetujui"),
 ("dosen3","pengabdian","Pelatihan Literasi Digital dan Pemasaran Daring bagi UMKM Desa",["dosen1","dosen5"],["mahasiswa1"],"disetujui"),
 ("dosen4","penelitian","Analisis Sentimen Ulasan Aplikasi Layanan Publik Menggunakan Naive Bayes",["dosen5","dosen6"],[],"review"),
 ("dosen1","pengabdian","Pendampingan Pengelolaan Keuangan Digital bagi Koperasi Sekolah",["dosen2","dosen6"],["mahasiswa3"],"diajukan"),
 ("dosen5","penelitian","Optimasi Rute Distribusi Logistik Menggunakan Algoritma Genetika",["dosen1","dosen3"],[],"revisi"),
 ("dosen6","pengabdian","Pelatihan Keamanan Siber Dasar untuk Perangkat Desa",["dosen4","dosen5"],["mahasiswa4"],"ditolak"),
 ("dosen2","penelitian","Rancang Bangun Aplikasi Presensi Dosen Berbasis QR Code",["dosen3","dosen4"],[],"diajukan"),
 ("dosen1","penelitian","Prediksi Kelulusan Mahasiswa Tepat Waktu Menggunakan Random Forest",["dosen2","dosen5"],["mahasiswa2"],"draft"),
]
for own,jenis,judul,ds,ms,st in plans:
    body={"judul":judul,"abstrak":AB,"jenis":jenis,"periodeId":pen if jenis=="penelitian" else pgb,"anggaran":15000000,"luaran":"Artikel jurnal nasional terakreditasi SINTA","rumpunIlmu":"Ilmu Komputer","bidang":"Sistem Informasi","kataKunci":["sistem informasi","data","teknologi"],
          "anggotaIds":[{"userId":I(d),"peran":"anggota"} for d in ds]+[{"userId":I(m),"peran":"anggota"} for m in ms]}
    if jenis=="penelitian": body["skema"]="Penelitian Dosen Pemula"
    else: body.update({"mitra":"Kelompok UMKM Desa Sejahtera","mitraJenis":"UMKM","mitraAlamat":"Desa Sei Rotan, Deli Serdang","mitraKontak":"081234567890","mitraKebutuhan":"Peningkatan kemampuan pemasaran dan administrasi digital"})
    s,b=req("POST","/proposals",T(own),body); pid=b["data"]["id"]; print(s,judul[:30])
    raw,ct=pdf(); print(" upload",req("POST",f"/proposals/{pid}/dokumen-utama",T(own),raw=raw,ct=ct)[0])
    for jt,tg in [("jurnal","Artikel jurnal nasional terakreditasi SINTA"),("hki","Hak cipta perangkat lunak")]:
        req("POST","/luaran",T(own),{"proposalId":pid,"jenis":jt,"target":tg,"targetTanggal":"2027-01-31"})
    if st=="draft": continue
    for a in ds+ms:
        inv=[i for i in req("GET","/dosen/proposals/invitations",T(a))[1]["data"] if i["proposal"]["id"]==pid][0]
        req("PATCH",f"/dosen/proposals/invitations/{inv['id']}",T(a),{"status":"diterima"})
    s,b=req("POST",f"/dosen/proposals/{pid}/submit",T(own)); print(" submit",s,b.get("message") if isinstance(b,dict) else b)
    if st=="diajukan": continue
    rv=[r for r in ["reviewer1","reviewer2"]]
    print(" assign",req("POST",f"/proposals/{pid}/reviewers",T("ketua"),{"reviewerIds":[I(r) for r in rv]})[0])
    if st=="review":
        req("POST",f"/proposals/{pid}/reviews",T("reviewer1"),{"nilaiRelevansi":"85","nilaiMetodologi":"80","nilaiAnggaran":"78","nilaiLuaran":"82","catatan":"Metodologi perlu diperjelas.","rekomendasi":"revisi"})
        continue
    rek={"disetujui":"disetujui","revisi":"revisi","ditolak":"ditolak"}[st]
    for r in rv:
        req("POST",f"/proposals/{pid}/reviews",T(r),{"nilaiRelevansi":"86","nilaiMetodologi":"82","nilaiAnggaran":"80","nilaiLuaran":"85","catatan":"Proposal relevan dengan kebutuhan mitra dan metodologi cukup jelas.","rekomendasi":rek})
        req("POST",f"/proposals/{pid}/reviews/finalize",T(r))
    body={"status":st}
    if st=="revisi": body["catatanRevisi"]="Lengkapi rencana anggaran dan jadwal pelaksanaan."
    print(" status",req("PATCH",f"/proposals/{pid}/status",T("ketua"),body)[0])
    if st=="disetujui":
        for m in ms:
            for k,(tg,kg) in enumerate([("2026-10-20","Mengumpulkan data awal dan melakukan wawancara dengan mitra."),("2026-10-21","Mengolah data dan menyusun dokumentasi kegiatan.")]):
                print(" lh",req("POST",f"/mahasiswa/laporan-harian/{pid}",T(m),{"tanggal":tg,"kegiatan":kg,"linkGdrive":"https://drive.google.com/drive/folders/contoh"})[0])
