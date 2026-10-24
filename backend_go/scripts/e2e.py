#!/usr/bin/env python3
"""End-to-end scenario for the API (Go or Node backend).

Asserts the status codes, messages and response shapes produced by the Node
backend. Requirements: a DEVELOPMENT database migrated and seeded with
`go run ./cmd/seed` (or `npm run db:seed`), and the server started with
TRUST_PROXY=true (the script sends random X-Forwarded-For headers so the
login rate limiter does not trigger).

WARNING: the script creates and deletes data. Never run it in production.

    python3 scripts/e2e.py http://localhost:3000
"""
import io, json, sys, uuid, zipfile, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
FAILS = []
CHECKS = 0


def req(method, path, token=None, body=None, raw=None, ctype=None, headers=None):
    data = None
    h = {"X-Forwarded-For": "10.1.%d.%d" % (uuid.uuid4().int % 250, uuid.uuid4().int % 250)}
    h.update(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if raw is not None:
        data = raw
        h["Content-Type"] = ctype
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        resp = urllib.request.urlopen(r)
        status, content, hdrs = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        status, content, hdrs = e.code, e.read(), e.headers
    try:
        parsed = json.loads(content) if content else None
    except Exception:
        parsed = content
    return status, parsed, hdrs, content


def multipart(fields, file=None):
    boundary = "----b" + uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    if file:
        name, filename, ctype, content = file
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, "multipart/form-data; boundary=" + boundary


def check(name, cond, info=None):
    global CHECKS
    CHECKS += 1
    if not cond:
        FAILS.append(name)
        print("FAIL:", name, "" if info is None else json.dumps(info, default=str)[:600])


def expect(name, res, status, message=None):
    st, body = res[0], res[1]
    ok = st == status and (message is None or (isinstance(body, dict) and body.get("message") == message))
    check(f"{name} → {status} {message or ''}", ok, {"status": st, "body": body})
    return body


def login(email, pw):
    st, b, *_ = req("POST", "/api/v1/auth/login", body={"email": email, "password": pw}, headers={"X-Forwarded-For": "10.0.%d.%d" % (uuid.uuid4().int % 250, uuid.uuid4().int % 250)})
    assert st == 200, (email, st, b)
    return b["data"]["accessToken"], b["data"]["refreshToken"], b["data"]["user"]


def _zip(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in entries:
            z.writestr(name, content)
    return buf.getvalue()


PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
DOCX = _zip([("[Content_Types].xml", "<Types/>"), ("_rels/.rels", "<Relationships/>"), ("word/document.xml", "<w:document/>")])
FAKE = b"<html><script>alert(1)</script></html>"
XLSX = _zip([("xl/workbook.xml", "<x/>")])

admin, adminRefresh, adminUser = login("admin@lppm.dev", "admin123456")
ketua, *_ = login("ketua@lppm.dev", "ketua123456")
wakil, *_ = login("wakil.ketua@lppm.dev", "wakil123456")
rev1, _, rev1User = login("reviewer1@lppm.dev", "reviewer123")
dosen1, _, dosen1User = login("dosen1@lppm.dev", "dosen123456")
dosen2, _, dosen2User = login("dosen2@lppm.dev", "dosen123456")
dosen5, _, dosen5User = login("dosen5@lppm.dev", "dosen123456")
mhs1, _, mhs1User = login("mahasiswa1@lppm.dev", "mhs1234567")
mhs2, _, mhs2User = login("mahasiswa2@lppm.dev", "mhs1234567")
check("login user shape", list(adminUser.keys()) == ["id", "name", "fullName", "email", "status", "roles"], adminUser)
check("wakil roles ordered by roleId", login("wakil.ketua@lppm.dev", "wakil123456")[2]["roles"] == ["ketua_lppm", "dosen"])

# ── auth ──
expect("login wrong password", req("POST", "/api/v1/auth/login", body={"email": "admin@lppm.dev", "password": "wrongpass"}), 500, "Invalid credentials")
expect("login pending account", req("POST", "/api/v1/auth/login", body={"email": "pending.dosen@lppm.dev", "password": "pending123"}), 500, "Account not approved yet")
b = expect("login missing fields", req("POST", "/api/v1/auth/login", body={}), 422, "Validation error")
check("login missing → Required", b["errors"] == {"email": ["Required"], "password": ["Required"]}, b)
expect("bad json", req("POST", "/api/v1/auth/login", raw=b'{"x":', ctype="application/json"), 400)
b = expect("me", req("GET", "/api/v1/auth/me", dosen1), 200, "Current user")
check("me shape", list(b["data"].keys()) == ["id", "name", "fullName", "email", "status", "roles", "hasTugasan"] and b["data"]["hasTugasan"] is False, b)
expect("me bad token", req("GET", "/api/v1/auth/me", "xxx"), 401, "Token invalid or expired")
expect("refresh blank", req("POST", "/api/v1/auth/refresh", body={"refreshToken": "   "}), 400, "Refresh token required")
expect("refresh unknown", req("POST", "/api/v1/auth/refresh", body={"refreshToken": "nope"}), 500, "Refresh token invalid or expired")
import time; time.sleep(1.1)
b = expect("refresh", req("POST", "/api/v1/auth/refresh", body={"refreshToken": adminRefresh}), 200, "Token refreshed")
check("refresh shape", list(b["data"].keys()) == ["accessToken", "refreshToken"], b)
expect("refresh reused", req("POST", "/api/v1/auth/refresh", body={"refreshToken": adminRefresh}), 500, "Refresh token invalid or expired")
expect("logout", req("POST", "/api/v1/auth/logout", body={"refreshToken": b["data"]["refreshToken"]}), 200, "Logged out successfully")
check("logout has no data key", "data" not in req("POST", "/api/v1/auth/logout", body={"refreshToken": "x"})[1])
email = f"new{uuid.uuid4().hex[:6]}@lppm.dev"
b = expect("register dosen", req("POST", "/api/v1/auth/register/dosen", body={"email": email, "name": "Dosen Baru", "password": "password123", "tanggalLahir": "1990-01-02T00:00:00Z", "nidn": "55" + uuid.uuid4().hex[:8]}), 201, "Registration submitted, awaiting approval")
newUserId = b["data"]["id"]
check("register shape", list(b["data"].keys()) == ["id", "email", "name", "status"] and b["data"]["status"] == "pending", b)
expect("register duplicate", req("POST", "/api/v1/auth/register/dosen", body={"email": email, "name": "Dosen Baru", "password": "password123"}), 409, "Resource already exists")
b = expect("register bad date", req("POST", "/api/v1/auth/register/dosen", body={"email": "x" + email, "name": "D", "password": "short", "tanggalLahir": "1990-01-02"}), 422)
check("register errors", b["errors"] == {"name": ["String must contain at least 2 character(s)"], "password": ["String must contain at least 8 character(s)"], "tanggalLahir": ["Invalid datetime"]}, b)
expect("forgot unknown email", req("POST", "/api/v1/auth/forgot-password", body={"email": "nobody@lppm.dev"}), 200, "If your email is registered, you will receive a reset link")
expect("reset bad token", req("POST", "/api/v1/auth/reset-password", body={"token": "abc", "newPassword": "password123"}), 500, "Token invalid or expired")

# ── users ──
b = expect("users list", req("GET", "/api/v1/users?limit=5", admin), 200, "Users fetched")
check("users meta", b["meta"] == {"page": 1, "limit": 5, "total": b["meta"]["total"]} and len(b["data"]) == 5, b.get("meta"))
check("user shape", list(b["data"][0].keys()) == ["id", "email", "name", "fullName", "status", "nidn", "nim", "prodi", "programStudi", "institusi", "kontak", "noHp", "alamat", "tempatLahir", "tanggalLahir", "createdAt", "roles"], b["data"][0])
check("user roles shape", isinstance(b["data"][0]["roles"][0]["role"]["name"], str), b["data"][0]["roles"])
b = expect("users limit>100", req("GET", "/api/v1/users?limit=500", admin), 422, "Validation error")
check("users limit msg", b["errors"] == {"limit": ["Number must be less than or equal to 100"]}, b)
expect("users forbidden", req("GET", "/api/v1/users", dosen1), 403, "Forbidden: insufficient permissions")
b = expect("users filter role", req("GET", "/api/v1/users?role=reviewer&status=approved&search=Reviewer", ketua), 200)
check("users filter result", all(any(r["role"]["name"] == "reviewer" for r in u["roles"]) for u in b["data"]) and b["meta"]["total"] >= 4, b["meta"])
expect("user by id", req("GET", f"/api/v1/users/{newUserId}", admin), 200, "User fetched")
expect("user 404", req("GET", "/api/v1/users/999999", admin), 404, "User not found")
b = expect("user bad id → ZodError 500", req("GET", "/api/v1/users/abc", admin), 500)
check("zod message", "Expected number, received nan" in b["message"], b)
b = expect("approve user", req("PATCH", f"/api/v1/users/{newUserId}/status", admin, {"status": "approved"}), 200, "Status updated")
check("status shape", list(b["data"].keys()) == ["id", "name", "email", "status"], b)
b = expect("assign roles", req("PATCH", f"/api/v1/users/{newUserId}/roles", admin, {"roles": ["reviewer", "dosen"]}), 200, "Roles assigned")
check("assigned roles", [r["role"]["name"] for r in b["data"]["roles"]] == ["dosen", "reviewer"], b["data"]["roles"])
b = expect("search users", req("GET", "/api/v1/users/search?q=Dosen&limit=3", mhs1), 200, "Users found")
check("search shape", len(b["data"]) == 3 and list(b["data"][0].keys()) == ["id", "name", "fullName", "email", "programStudi", "prodi", "nim", "nidn", "roles"], b["data"][:1])
b = expect("profile update", req("PATCH", "/api/v1/users/profile/me", mhs2, {"alamat": "Jl. Baru", "tanggalLahir": "2001-05-06", "password": "hacked"}), 200, "Profile updated")
check("profile values", b["data"]["alamat"] == "Jl. Baru" and b["data"]["tanggalLahir"] == "2001-05-06T00:00:00.000Z", b["data"])
login("mahasiswa2@lppm.dev", "mhs1234567")  # password field ignored
expect("change password wrong", req("PATCH", "/api/v1/users/profile/password", mhs2, {"oldPassword": "x", "newPassword": "y"}), 400, "Old password is incorrect")
expect("change password", req("PATCH", "/api/v1/users/profile/password", mhs2, {"oldPassword": "mhs1234567", "newPassword": "mhs1234567"}), 200, "Password changed successfully")
expect("delete user", req("DELETE", f"/api/v1/users/{newUserId}", admin), 200, "User deleted")
expect("delete user again", req("DELETE", f"/api/v1/users/{newUserId}", admin), 500)

# ── periode ──
b = expect("periode list", req("GET", "/api/v1/periode", dosen1), 200, "Periode fetched")
check("periode shape", list(b["data"][0].keys()) == ["id", "nama", "tahun", "jenis", "tanggalMulai", "tanggalSelesai", "isAktif", "createdAt", "updatedAt"], b["data"][0])
check("periode order", [p["tahun"] for p in b["data"]] == sorted([p["tahun"] for p in b["data"]], reverse=True))
aktif = req("GET", "/api/v1/periode?isAktif=true&jenis=penelitian", dosen1)[1]["data"]
check("periode filter", len(aktif) == 1 and aktif[0]["isAktif"] is True, aktif)
periodePen = aktif[0]["id"]
periodePeng = req("GET", "/api/v1/periode?isAktif=true&jenis=pengabdian", dosen1)[1]["data"][0]["id"]
expect("periode bad jenis", req("GET", "/api/v1/periode?jenis=xx", dosen1), 500)
expect("periode 404", req("GET", "/api/v1/periode/99999", dosen1), 500, "Periode tidak ditemukan")
b = expect("periode create invalid", req("POST", "/api/v1/periode", admin, {"nama": "ab", "tahun": 1999, "jenis": "x", "tanggalMulai": "2026-13-01", "tanggalSelesai": 5}), 422)
check("periode errors", b["errors"] == {"nama": ["Nama minimal 3 karakter"], "tahun": ["Number must be greater than or equal to 2000"], "jenis": ["Invalid enum value. Expected 'penelitian' | 'pengabdian', received 'x'"], "tanggalMulai": ["Invalid datetime"], "tanggalSelesai": ["Invalid input"]}, b)
b = expect("periode create", req("POST", "/api/v1/periode", admin, {"nama": "Periode Uji", "tahun": 2027, "jenis": "penelitian", "tanggalMulai": "2027-01-01", "tanggalSelesai": "2027-06-30T10:00:00+07:00"}), 201, "Periode created")
newPeriode = b["data"]["id"]
check("periode dates", b["data"]["tanggalMulai"] == "2027-01-01T00:00:00.000Z" and b["data"]["tanggalSelesai"] == "2027-06-30T03:00:00.000Z" and b["data"]["isAktif"] is True, b["data"])
b = expect("periode update", req("PATCH", f"/api/v1/periode/{newPeriode}", ketua, {"nama": "Periode Uji 2", "isAktif": False}), 200, "Periode updated")
check("periode updated", b["data"]["nama"] == "Periode Uji 2" and b["data"]["isAktif"] is False, b["data"])
expect("deletion pending none", req("GET", f"/api/v1/periode/{newPeriode}/deletion-request", admin), 200, "Pending deletion request")
check("deletion pending null", req("GET", f"/api/v1/periode/{newPeriode}/deletion-request", admin)[1]["data"] is None)
expect("deletion no password", req("POST", f"/api/v1/periode/{newPeriode}/deletion-request", admin, {}), 400, "Password wajib diisi")
expect("deletion wrong password", req("POST", f"/api/v1/periode/{newPeriode}/deletion-request", admin, {"password": "x"}), 500, "Password salah")
b = expect("deletion request", req("POST", f"/api/v1/periode/{newPeriode}/deletion-request", admin, {"password": "admin123456"}), 200, "Permintaan penghapusan berhasil dibuat")
reqId = b["data"]["requestId"]
check("deletion request shape", list(b["data"].keys()) == ["requestId", "expiresAt"], b)
b = req("GET", f"/api/v1/periode/{newPeriode}/deletion-request", ketua)[1]
check("deletion pending shape", b["data"]["id"] == reqId and b["data"]["requester"] == {"id": adminUser["id"], "name": "Admin LPPM"} and b["data"]["approverId"] is None, b)
n = req("GET", "/api/v1/notifications", ketua)[1]
check("ketua got deletion notif", any(x["type"] == "deletion_request" and x["refId"] == reqId for x in n["data"]), n["data"][:2])
expect("approve own request", req("POST", f"/api/v1/periode/deletion-request/{reqId}/approve", admin, {"password": "admin123456"}), 500, "Tidak dapat menyetujui permintaan yang Anda buat sendiri")
expect("approve", req("POST", f"/api/v1/periode/deletion-request/{reqId}/approve", ketua, {"password": "ketua123456"}), 200, "Periode berhasil dihapus")
expect("periode deleted", req("GET", f"/api/v1/periode/{newPeriode}", ketua), 500, "Periode tidak ditemukan")
expect("cancel missing", req("POST", f"/api/v1/periode/deletion-request/{reqId}/cancel", ketua), 500, "Permintaan penghapusan tidak ditemukan atau sudah tidak valid")

# ── proposals ──
abstrak = "Abstrak penelitian yang cukup panjang untuk validasi."
b = expect("create proposal invalid", req("POST", "/api/v1/proposals", dosen1, {"judul": "abc", "abstrak": "x", "jenis": "penelitian", "anggaran": -5, "dokumenUrl": "notaurl", "anggotaIds": [{"userId": 0}]}), 422)
check("create proposal errors", b["errors"] == {"judul": ["Judul minimal 5 karakter"], "abstrak": ["Abstrak minimal 20 karakter"], "anggaran": ["Number must be greater than 0"], "dokumenUrl": ["URL dokumen tidak valid"], "anggotaIds": ["Number must be greater than 0"]}, b)
expect("create proposal no periode", req("POST", "/api/v1/proposals", dosen1, {"judul": "Judul Proposal", "abstrak": abstrak, "jenis": "penelitian"}), 500, "Periode harus dipilih")
expect("create proposal jenis mismatch", req("POST", "/api/v1/proposals", dosen1, {"judul": "Judul Proposal", "abstrak": abstrak, "jenis": "pengabdian", "periodeId": periodePen}), 500, "Jenis proposal (pengabdian) tidak sesuai dengan jenis periode (penelitian)")
expect("create proposal forbidden", req("POST", "/api/v1/proposals", admin, {}), 403, "Forbidden: insufficient permissions")
b = expect("create proposal", req("POST", "/api/v1/proposals", dosen1, {"judul": "Sistem Uji Coba Go", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen, "anggaran": 15000000.5, "dokumenUrl": "https://drive.google.com/x", "anggotaIds": [{"userId": mhs1User["id"]}, {"userId": dosen2User["id"], "peran": "co-peneliti"}]}), 201, "Proposal created")
P = b["data"]
pid = P["id"]
check("proposal shape", list(P.keys()) == ["id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt", "pengusul", "periode", "anggota", "reviewerTugasan"], list(P.keys()))
check("proposal values", P["status"] == "draft" and P["anggaran"] == "15000000.5" and P["periode"]["id"] == periodePen and list(P["periode"].keys()) == ["id", "nama", "tahun"] and list(P["pengusul"].keys()) == ["id", "name", "fullName", "email", "programStudi", "nidn"], P)
check("proposal anggota", [a["user"]["id"] for a in P["anggota"]] == [mhs1User["id"], dosen2User["id"]] and P["anggota"][0]["peran"] == "anggota" and list(P["anggota"][0].keys()) == ["id", "peran", "user"], P["anggota"])
expect("create dup anggota", req("POST", "/api/v1/proposals", dosen1, {"judul": "Sistem Uji Coba Go", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen, "anggotaIds": [{"userId": mhs1User["id"]}, {"userId": mhs1User["id"]}]}), 409, "Resource already exists")
b = expect("my proposals", req("GET", "/api/v1/proposals/my", dosen1), 200, "My proposals fetched")
check("my proposals meta", b["meta"]["page"] == 1 and b["meta"]["limit"] == 10 and b["data"][0]["id"] == pid, b["meta"])
b = expect("list proposals admin", req("GET", f"/api/v1/proposals?status=draft&tahun={aktif[0]['tahun']}&search=Uji%20Coba&page=abc", admin), 200, "Proposals fetched")
check("list filter", any(x["id"] == pid for x in b["data"]) and b["meta"]["page"] == 1, b["meta"])
expect("list proposals dosen forbidden", req("GET", "/api/v1/proposals", dosen5), 403)
expect("list page 0", req("GET", "/api/v1/proposals?page=0", admin), 500)
b = expect("detail admin", req("GET", f"/api/v1/proposals/{pid}", admin), 200, "Proposal fetched")
check("detail keys", list(b["data"].keys())[-5:] == ["anggota", "reviewerTugasan", "reviews", "laporan", "dokumenLampiran"], list(b["data"].keys()))
expect("detail pending member forbidden", req("GET", f"/api/v1/proposals/{pid}", mhs1), 403, "Anda tidak memiliki akses ke proposal ini")
expect("detail missing admin", req("GET", "/api/v1/proposals/999999", admin), 500, "Proposal tidak ditemukan")
expect("detail missing dosen", req("GET", "/api/v1/proposals/999999", dosen1), 403)
expect("detail NaN", req("GET", "/api/v1/proposals/abc", admin), 500)

# invitations
b = expect("invitations", req("GET", "/api/v1/dosen/proposals/invitations", mhs1), 200, "Invitations fetched")
inv = [i for i in b["data"] if i["proposal"]["id"] == pid][0]
check("invitation shape", list(inv.keys()) == ["id", "peran", "statusUndangan", "createdAt", "proposal"] and list(inv["proposal"].keys()) == ["id", "judul", "jenis", "status", "anggaran", "pengusul", "periode"], inv)
expect("respond bad body", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", mhs1, {"status": "x"}), 400)
check("respond bad body no success key", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", mhs1, {"status": "x"})[1] == {"message": "Status harus diterima atau ditolak"})
expect("respond other user", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", dosen2, {"status": "diterima"}), 500, "Anda tidak memiliki akses ke undangan ini")
b = expect("accept invitation", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", mhs1, {"status": "diterima"}), 200, "Undangan berhasil diterima")
check("accept shape", list(b["data"].keys()) == ["id", "peran", "statusUndangan", "proposal"] and b["data"]["proposal"] == {"id": pid, "judul": "Sistem Uji Coba Go"}, b["data"])
expect("accept again", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", mhs1, {"status": "diterima"}), 500, "Undangan sudah direspon sebelumnya")
inv2 = [i for i in req("GET", "/api/v1/dosen/proposals/invitations", dosen2)[1]["data"] if i["proposal"]["id"] == pid][0]
expect("reject invitation", req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv2['id']}", dosen2, {"status": "ditolak"}), 200, "Undangan berhasil ditolak")
expect("detail accepted member", req("GET", f"/api/v1/proposals/{pid}", mhs1), 200)

# dosen module
b = expect("dosen list", req("GET", "/api/v1/dosen/proposals?status=draft", dosen1), 200, "Proposals fetched")
check("dosen list shape", list(b["data"][0].keys()) == ["id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "catatanRevisi", "dokumenUrl", "submittedAt", "approvedAt", "createdAt", "updatedAt", "pengusul", "periode", "anggota", "reviewerTugasan"] and "statusUndangan" in b["data"][0]["anggota"][0] and list(b["data"][0]["periode"].keys()) == ["id", "nama", "tahun", "jenis"], b["data"][0])
expect("dosen list bad status", req("GET", "/api/v1/dosen/proposals?status=x", dosen1), 500)
b = expect("dosen stats", req("GET", "/api/v1/dosen/proposals/stats", dosen1), 200, "Stats fetched")
check("stats shape", list(b["data"].keys()) == ["total", "draft", "diajukan", "disetujui", "revisi", "ditolak"], b)
expect("members search short", req("GET", "/api/v1/dosen/proposals/members/search?q=a", dosen1), 400, "Ketik minimal 2 karakter untuk mencari pengguna")
b = expect("members search", req("GET", "/api/v1/dosen/proposals/members/search?q=mahasiswa", dosen1), 200, "Users fetched")
check("members shape", len(b["data"]) <= 10 and list(b["data"][0].keys()) == ["id", "name", "fullName", "email", "nidn", "nim", "programStudi", "prodi", "roles"], b["data"][:1])
expect("dosen get other", req("GET", f"/api/v1/dosen/proposals/{pid}", dosen2), 500, "Anda tidak memiliki akses ke proposal ini")
b = expect("dosen get", req("GET", f"/api/v1/dosen/proposals/{pid}", dosen1), 200, "Proposal fetched")
check("dosen detail keys", list(b["data"].keys())[-3:] == ["reviews", "laporan", "dokumenLampiran"])
expect("dosen submit with rejected member", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", dosen1), 500, "Proposal tidak dapat diajukan: 1 anggota menolak undangan. Semua anggota harus menyetujui undangan terlebih dahulu.")
b = expect("dosen update", req("PATCH", f"/api/v1/dosen/proposals/{pid}", dosen1, {"judul": "Sistem Uji Coba Golang", "anggotaIds": [{"userId": mhs1User["id"], "peran": "anggota"}]}), 200, "Proposal berhasil diperbarui")
check("update reset anggota", len(b["data"]["anggota"]) == 1 and b["data"]["anggota"][0]["statusUndangan"] == "pending", b["data"]["anggota"])
inv = [i for i in req("GET", "/api/v1/dosen/proposals/invitations", mhs1)[1]["data"] if i["proposal"]["id"] == pid][0]
expect("submit pending", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", dosen1), 500, "Proposal tidak dapat diajukan: 1 anggota belum merespons undangan. Semua anggota harus menyetujui undangan terlebih dahulu.")
req("PATCH", f"/api/v1/dosen/proposals/invitations/{inv['id']}", mhs1, {"status": "diterima"})
b = expect("dosen submit", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", dosen1), 200, "Proposal berhasil diajukan")
check("submitted", b["data"]["status"] == "diajukan" and b["data"]["submittedAt"] is not None, b["data"])
expect("update after submit", req("PATCH", f"/api/v1/proposals/{pid}", dosen1, {"judul": "Judul Lain Lagi"}), 500, "Proposal hanya bisa diedit saat status draft atau revisi")
expect("delete non draft", req("DELETE", f"/api/v1/proposals/{pid}", dosen1), 500, "Hanya proposal berstatus draft yang bisa dihapus")

# reviewers
b = expect("assign reviewer invalid", req("POST", f"/api/v1/proposals/{pid}/reviewers", ketua, {"reviewerIds": []}), 422)
check("assign reviewer msg", b["errors"] == {"reviewerIds": ["Minimal 1 reviewer"]}, b)
b = expect("assign reviewer", req("POST", f"/api/v1/proposals/{pid}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]}), 200, "Reviewer ditugaskan")
check("assign shape", list(b["data"].keys()) == ["id", "judul", "status", "reviewerTugasan"] and b["data"]["status"] == "review" and list(b["data"]["reviewerTugasan"][0]["reviewer"].keys()) == ["id", "name", "email"], b["data"])
req("POST", f"/api/v1/proposals/{pid}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]})  # skipDuplicates
b = expect("my tugasan", req("GET", "/api/v1/reviewer/my-tugasan", rev1), 200, "Tugasan review fetched")
t = [x for x in b["data"] if x["proposalId"] == pid][0]
check("tugasan shape", list(t.keys()) == ["id", "proposalId", "reviewerId", "createdAt", "proposal", "myReview"] and t["myReview"] is None and list(t["proposal"].keys()) == ["id", "judul", "status", "jenis", "pengusul"], t)
check("tugasan no duplicate", len([x for x in b["data"] if x["proposalId"] == pid]) == 1)
expect("review not assigned", req("POST", f"/api/v1/proposals/{pid}/reviews", login("reviewer2@lppm.dev", "reviewer123")[0], {"catatan": "x"}), 500, "Anda tidak ditugaskan untuk mereview proposal ini")
expect("finalize before review", req("POST", f"/api/v1/proposals/{pid}/reviews/finalize", rev1), 500)
b = expect("submit review", req("POST", f"/api/v1/proposals/{pid}/reviews", rev1, {"nilaiRelevansi": "85", "catatan": "Bagus", "rekomendasi": "disetujui"}), 200, "Review disimpan")
check("review shape", list(b["data"].keys()) == ["id", "proposalId", "reviewerId", "nilaiRelevansi", "nilaiMetodologi", "nilaiAnggaran", "nilaiLuaran", "catatan", "rekomendasi", "isDone", "createdAt", "updatedAt"] and b["data"]["isDone"] is False, b["data"])
b = expect("submit review update", req("POST", f"/api/v1/proposals/{pid}/reviews", rev1, {"nilaiMetodologi": "90"}), 200)
check("review upsert keeps", b["data"]["nilaiRelevansi"] == "85" and b["data"]["nilaiMetodologi"] == "90", b["data"])
b = expect("finalize", req("POST", f"/api/v1/proposals/{pid}/reviews/finalize", rev1), 200, "Review diselesaikan")
check("finalized", b["data"]["isDone"] is True, b)
b = expect("reviews by proposal", req("GET", f"/api/v1/proposals/{pid}/reviews", ketua), 200, "Reviews fetched")
check("reviews shape", list(b["data"][0]["reviewer"].keys()) == ["id", "name", "fullName"], b["data"])
b = expect("me has tugasan", req("GET", "/api/v1/auth/me", rev1), 200)
check("hasTugasan true", b["data"]["hasTugasan"] is True)

# status
expect("status invalid", req("PATCH", f"/api/v1/proposals/{pid}/status", ketua, {"status": "draft"}), 422)
b = expect("status revisi", req("PATCH", f"/api/v1/proposals/{pid}/status", ketua, {"status": "revisi", "catatanRevisi": "Perbaiki"}), 200, "Status proposal diperbarui")
check("revisi catatan", b["data"]["catatanRevisi"] == "Perbaiki", b["data"])
n = req("GET", "/api/v1/notifications?limit=50", dosen1)[1]["data"]
check("revisi notif", any(x["type"] == "proposal_revisi" and x["judul"] == "Proposal revisi" and x["pesan"] == 'Proposal "Sistem Uji Coba Golang" telah revisi. Catatan: Perbaiki' for x in n), n[:3])
b = expect("status review clears catatan", req("PATCH", f"/api/v1/proposals/{pid}/status", ketua, {"status": "review", "catatanRevisi": "x"}), 200)
check("catatan null", b["data"]["catatanRevisi"] is None, b["data"])
b = expect("status disetujui", req("PATCH", f"/api/v1/proposals/{pid}/status", admin, {"status": "disetujui"}), 200)
check("approvedAt", b["data"]["approvedAt"] is not None and b["data"]["status"] == "disetujui")

# dokumen utama
body, ct = multipart({}, ("file", "proposal utama.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", DOCX))
b = expect("upload dokumen utama", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 200, "Dokumen berhasil diunggah")
check("upload shape", b["data"] == {"id": pid, "dokumenNama": "proposal utama.docx", "dokumenMime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "dokumenUkuran": len(DOCX)}, b)
st, _, hdrs, content = req("GET", f"/api/v1/proposals/{pid}/dokumen-utama", rev1)
check("download dokumen utama", st == 200 and content == DOCX and hdrs["Content-Disposition"] == 'inline; filename="proposal%20utama.docx"' and hdrs["Content-Type"].startswith("application/vnd.openxml"), (st, dict(hdrs)))
body, ct = multipart({}, ("file", "x.pdf", "application/pdf", FAKE))
expect("upload fake pdf", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 400, "Tidak dapat mendeteksi tipe file. Pastikan file tidak corrupt.")
body, ct = multipart({}, ("file", "x.pdf", "application/pdf", XLSX))
expect("upload xlsx as pdf", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 400, 'Tipe file "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tidak diizinkan. Hanya PDF atau DOCX yang diizinkan.')
body, ct = multipart({}, ("file", "x.png", "image/png", PDF))
expect("upload filtered mimetype", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 500, "Hanya file PDF atau DOCX yang diizinkan.")
body, ct = multipart({"a": "b"})
expect("upload no file", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 400, "File tidak ditemukan dalam request.")
body, ct = multipart({}, ("other", "x.pdf", "application/pdf", PDF))
expect("upload unexpected field", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen1, raw=body, ctype=ct), 500, "Unexpected field")
body, ct = multipart({}, ("file", "x.pdf", "application/pdf", PDF))
expect("upload by stranger", req("POST", f"/api/v1/proposals/{pid}/dokumen-utama", dosen2, raw=body, ctype=ct), 403)

# laporan
body, ct = multipart({"jenis": "kemajuan", "judul": "Laporan Kemajuan", "keterangan": "ok"}, ("file", "lap.pdf", "application/pdf", PDF))
b = expect("create laporan", req("POST", f"/api/v1/proposals/{pid}/laporan", mhs1, raw=body, ctype=ct), 201, "Laporan diunggah")
lid = b["data"]["id"]
check("laporan shape", list(b["data"].keys()) == ["id", "proposalId", "jenis", "judul", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "keterangan", "createdAt", "updatedAt"] and b["data"]["dokumenMime"] == "application/pdf", b["data"])
expect("create laporan no source", req("POST", f"/api/v1/proposals/{pid}/laporan", dosen1, {"jenis": "akhir", "judul": "Akhir"}), 500, "File atau URL dokumen wajib diisi.")
b = expect("create laporan url", req("POST", f"/api/v1/proposals/{pid}/laporan", dosen1, {"jenis": "akhir", "judul": "Akhir", "dokumenUrl": "https://x.y/z"}), 201)
lid2 = b["data"]["id"]
b = expect("list laporan", req("GET", f"/api/v1/proposals/{pid}/laporan", rev1), 200, "Laporan fetched")
check("laporan order desc", [x["id"] for x in b["data"]][:2] == [lid2, lid], [x["id"] for x in b["data"]])
expect("list laporan bad param", req("GET", "/api/v1/proposals/abc/laporan", rev1), 400, "Parameter proposalId tidak valid.")
expect("list laporan missing proposal", req("GET", "/api/v1/proposals/999999/laporan", admin), 500)
st, _, hdrs, content = req("GET", f"/api/v1/proposals/laporan/{lid}/download", admin)
check("download laporan", st == 200 and content == PDF and hdrs["Content-Length"] == str(len(PDF)), st)
expect("download laporan no file", req("GET", f"/api/v1/proposals/laporan/{lid2}/download", admin), 404, "File laporan tidak ditemukan.")
b = expect("patch laporan", req("PATCH", f"/api/v1/proposals/laporan/{lid}", dosen1, {"judul": "Laporan Kemajuan 2"}), 200, "Laporan updated")
check("patch laporan includes blob like Prisma", isinstance(b["data"]["dokumenBlob"], dict) and b["data"]["dokumenBlob"]["0"] == 37 and len(b["data"]["dokumenBlob"]) == len(PDF), str(b["data"].get("dokumenBlob"))[:80])
expect("patch laporan invalid", req("PATCH", f"/api/v1/proposals/laporan/{lid}", dosen1, {"jenis": "x"}), 422)
expect("patch laporan stranger", req("PATCH", f"/api/v1/proposals/laporan/{lid}", dosen2, {"judul": "Hack"}), 403)
expect("delete laporan", req("DELETE", f"/api/v1/proposals/laporan/{lid2}", dosen1), 200, "Laporan deleted")
expect("delete laporan again", req("DELETE", f"/api/v1/proposals/laporan/{lid2}", dosen1), 500)

# dokumen lampiran
b = expect("create dokumen invalid", req("POST", f"/api/v1/proposals/{pid}/dokumen", dosen1, {"namaFile": ""}), 500)
check("dokumen zod message", "Nama file wajib diisi." in b["message"] and "File atau URL dokumen wajib diisi." in b["message"], b["message"])
b = expect("create dokumen url", req("POST", f"/api/v1/proposals/{pid}/dokumen", dosen1, {"namaFile": "Link", "fileUrl": "https://a.b/c", "ukuran": "12"}), 201, "Dokumen uploaded")
did = b["data"]["id"]
check("dokumen shape", list(b["data"].keys()) == ["id", "proposalId", "namaFile", "fileUrl", "ukuran", "fileMime", "fileNama", "createdAt"] and b["data"]["ukuran"] == 12, b["data"])
body, ct = multipart({"namaFile": "Lampiran PDF"}, ("file", "lamp.pdf", "application/pdf", PDF))
b = expect("create dokumen file", req("POST", f"/api/v1/proposals/{pid}/dokumen", mhs1, raw=body, ctype=ct), 201)
did2 = b["data"]["id"]
check("dokumen file", b["data"]["fileUrl"] is None and b["data"]["fileMime"] == "application/pdf" and b["data"]["ukuran"] == len(PDF), b["data"])
b = expect("list dokumen", req("GET", f"/api/v1/proposals/{pid}/dokumen", admin), 200, "Dokumen fetched")
check("list dokumen", [x["id"] for x in b["data"]] == [did2, did], b["data"])
st, _, hdrs, content = req("GET", f"/api/v1/proposals/dokumen/{did2}/download", rev1)
check("download dokumen", st == 200 and content == PDF and 'filename="lamp.pdf"' in hdrs["Content-Disposition"], st)
expect("download dokumen no file", req("GET", f"/api/v1/proposals/dokumen/{did}/download", rev1), 404, "File dokumen tidak ditemukan.")
b = expect("detail with relations", req("GET", f"/api/v1/proposals/{pid}", dosen1), 200)
check("detail dokumenLampiran blob", isinstance(b["data"]["dokumenLampiran"][-1]["fileBlob"], dict) and b["data"]["dokumenLampiran"][0]["fileBlob"] is None, [list(x.keys()) for x in b["data"]["dokumenLampiran"]])
check("detail reviews shape", list(b["data"]["reviews"][0].keys()) == ["id", "nilaiRelevansi", "nilaiMetodologi", "nilaiAnggaran", "nilaiLuaran", "catatan", "rekomendasi", "isDone", "reviewer", "createdAt"] and list(b["data"]["reviewerTugasan"][0]["reviewer"].keys()) == ["id", "name", "fullName", "email"], b["data"]["reviews"])
expect("delete dokumen", req("DELETE", f"/api/v1/proposals/dokumen/{did}", dosen1), 200, "Dokumen deleted")

# laporan harian
b = expect("lh proposals", req("GET", "/api/v1/mahasiswa/laporan-harian/proposals", mhs1), 200, "Proposals fetched")
x = [p for p in b["data"] if p["id"] == pid][0]
check("lh proposals shape", list(x.keys()) == ["anggotaId", "peran", "id", "judul", "jenis", "status", "pengusul", "periode"], x)
expect("lh forbidden role", req("GET", "/api/v1/mahasiswa/laporan-harian/proposals", dosen1), 403)
expect("lh unknown path still 403", req("GET", "/api/v1/mahasiswa/laporan-harian/a/b/c", dosen1), 403)
expect("lh not member", req("GET", f"/api/v1/mahasiswa/laporan-harian/{pid}", mhs2), 403, "Anda bukan anggota proposal ini")
expect("lh create invalid", req("POST", f"/api/v1/mahasiswa/laporan-harian/{pid}", mhs1, {"kegiatan": "   "}), 400, "Tanggal dan kegiatan wajib diisi")
body, ct = multipart({"tanggal": "2026-10-20", "kegiatan": "  Studi literatur  ", "linkGdrive": " "}, ("file", "harian.pdf", "application/pdf", PDF))
b = expect("lh create", req("POST", f"/api/v1/mahasiswa/laporan-harian/{pid}", mhs1, raw=body, ctype=ct), 201, "Laporan harian berhasil dibuat")
lhid = b["data"]["id"]
check("lh create shape", list(b["data"].keys()) == ["id", "tanggal", "kegiatan", "dokumenNama", "dokumenMime", "dokumenUkuran", "linkGdrive", "createdAt"] and b["data"]["kegiatan"] == "Studi literatur" and b["data"]["linkGdrive"] is None and b["data"]["tanggal"] == "2026-10-20T00:00:00.000Z", b["data"])
b = expect("lh list", req("GET", f"/api/v1/mahasiswa/laporan-harian/{pid}", mhs1), 200, "Laporan harian fetched")
check("lh list shape", list(b["data"][0].keys()) == ["id", "tanggal", "kegiatan", "dokumenNama", "dokumenMime", "dokumenUkuran", "linkGdrive", "createdAt", "updatedAt"], b["data"][0])
st, _, hdrs, content = req("GET", f"/api/v1/mahasiswa/laporan-harian/dokumen/{lhid}", mhs1)
check("lh download", st == 200 and content == PDF, st)
expect("lh download other", req("GET", f"/api/v1/mahasiswa/laporan-harian/dokumen/{lhid}", mhs2), 403, "Akses ditolak")
expect("lh delete missing", req("DELETE", "/api/v1/mahasiswa/laporan-harian/999999", mhs1), 404, "Laporan tidak ditemukan")
expect("lh delete", req("DELETE", f"/api/v1/mahasiswa/laporan-harian/{lhid}", mhs1), 200, "Laporan harian berhasil dihapus")

# ── laporan (tipe 'laporan', endpoint baru /api/v1/laporan) ──
LAP_KEYS = ["id", "tipe", "proposalId", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "luaranTercapai", "ringkasanHasil", "realisasiAnggaran", "catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt", "pengusul", "periode", "proposal", "reviewerTugasan"]
b = expect("laporan eligible", req("GET", "/api/v1/laporan/eligible", dosen1), 200, "Proposal siap dilaporkan fetched")
check("laporan eligible has pid", any(x["id"] == pid for x in b["data"]) and list(b["data"][0].keys()) == ["id", "judul", "jenis", "status", "anggaran", "luaran", "approvedAt", "periode"], b["data"][:1])
expect("laporan create invalid", req("POST", "/api/v1/laporan", dosen1, {"proposalId": 0}), 422)
expect("laporan create by non-pengusul", req("POST", "/api/v1/laporan", mhs1, {"proposalId": pid}), 403, "Hanya pengusul proposal yang dapat membuat laporan")
expect("laporan create missing proposal", req("POST", "/api/v1/laporan", dosen1, {"proposalId": 999999}), 404, "Proposal tidak ditemukan")
expect("laporan create forbidden role", req("POST", "/api/v1/laporan", admin, {"proposalId": pid}), 403)
b = expect("laporan create", req("POST", "/api/v1/laporan", dosen1, {"proposalId": pid, "ringkasanHasil": "Ringkas"}), 201, "Laporan berhasil dibuat")
L = b["data"]
lapId = L["id"]
check("laporan shape", list(L.keys()) == LAP_KEYS, list(L.keys()))
check("laporan values", L["tipe"] == "laporan" and L["proposalId"] == pid and L["status"] == "draft" and L["jenis"] == "penelitian" and L["anggaran"] == "15000000.5" and L["proposal"]["id"] == pid and lapId != pid, L)
expect("laporan create duplicate", req("POST", "/api/v1/laporan", dosen1, {"proposalId": pid}), 409, "Proposal ini sudah memiliki laporan")
b = expect("laporan eligible after", req("GET", "/api/v1/laporan/eligible", dosen1), 200)
check("laporan eligible excludes pid", all(x["id"] != pid for x in b["data"]), b["data"])
expect("laporan via old proposal endpoint", req("GET", f"/api/v1/proposals/{lapId}", admin), 500, "Proposal tidak ditemukan")
b = req("GET", "/api/v1/proposals/my?limit=100", dosen1)[1]
check("old my proposals excludes laporan", all(x["tipe"] == "proposal" and x["id"] != lapId for x in b["data"]), [x["id"] for x in b["data"]])
expect("laporan submit incomplete", req("POST", f"/api/v1/laporan/{lapId}/submit", dosen1), 400, "Luaran tercapai wajib diisi sebelum laporan diajukan")
expect("laporan update by anggota", req("PATCH", f"/api/v1/laporan/{lapId}", mhs1, {"luaranTercapai": "x"}), 403, "Anda tidak memiliki akses ke laporan ini")
b = expect("laporan update", req("PATCH", f"/api/v1/laporan/{lapId}", dosen1, {"luaranTercapai": "1 artikel jurnal SINTA 3", "realisasiAnggaran": 14000000}), 200, "Laporan berhasil diperbarui")
check("laporan updated", b["data"]["luaranTercapai"] == "1 artikel jurnal SINTA 3" and b["data"]["realisasiAnggaran"] == "14000000", b["data"])
expect("laporan submit no dokumen", req("POST", f"/api/v1/laporan/{lapId}/submit", dosen1), 400, "Dokumen laporan (file atau URL) wajib diunggah sebelum laporan diajukan")
body, ct = multipart({}, ("file", "laporan akhir.pdf", "application/pdf", PDF))
b = expect("laporan upload dokumen", req("POST", f"/api/v1/laporan/{lapId}/dokumen", dosen1, raw=body, ctype=ct), 200, "Dokumen laporan berhasil diunggah")
check("laporan upload shape", b["data"] == {"id": lapId, "dokumenNama": "laporan akhir.pdf", "dokumenMime": "application/pdf", "dokumenUkuran": len(PDF)}, b["data"])
st, _, hdrs, content = req("GET", f"/api/v1/laporan/{lapId}/dokumen", mhs1)
check("laporan download by anggota", st == 200 and content == PDF, st)
expect("laporan detail stranger", req("GET", f"/api/v1/laporan/{lapId}", dosen5), 403)
expect("laporan assign before submit", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]}), 400, "Laporan harus berstatus diajukan atau review untuk ditugaskan reviewer")
b = expect("laporan submit", req("POST", f"/api/v1/laporan/{lapId}/submit", dosen1), 200, "Laporan berhasil diajukan")
check("laporan diajukan", b["data"]["status"] == "diajukan" and b["data"]["submittedAt"] is not None, b["data"])
n = req("GET", "/api/v1/notifications?limit=50", ketua)[1]["data"]
check("ketua laporan notif", any(x["type"] == "laporan_diajukan" and x["refId"] == lapId and x["refType"] == "laporan" for x in n), n[:3])
expect("laporan edit after submit", req("PATCH", f"/api/v1/laporan/{lapId}", dosen1, {"ringkasanHasil": "x"}), 400, "Laporan hanya bisa diubah saat status draft atau revisi")
expect("laporan assign pengusul", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [dosen1User["id"]]}), 400, "Pengusul tidak dapat menjadi reviewer laporannya sendiri")
expect("laporan assign missing user", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [999999]}), 400, "Reviewer tidak ditemukan atau belum disetujui")
b = expect("laporan assign", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]}), 200, "Reviewer laporan ditugaskan")
check("laporan review status", b["data"]["status"] == "review" and b["data"]["reviewerTugasan"][0]["reviewer"]["id"] == rev1User["id"], b["data"])
b = expect("laporan tugasan", req("GET", "/api/v1/laporan/tugasan", rev1), 200, "Tugasan review laporan fetched")
t = b["data"][0]
check("laporan tugasan shape", list(t.keys()) == ["id", "laporanId", "reviewerId", "createdAt", "laporan", "myReview"] and t["laporanId"] == lapId and t["myReview"] is None and list(t["laporan"].keys()) == ["id", "proposalId", "judul", "status", "jenis", "pengusul"], t)
b = req("GET", "/api/v1/reviewer/my-tugasan?limit=100", rev1)[1]
check("old my-tugasan excludes laporan", all(x["proposalId"] != lapId and x["proposal"] is not None for x in b["data"]), b["data"][:1])
expect("laporan review not assigned", req("POST", f"/api/v1/laporan/{lapId}/reviews", dosen5, {"catatan": "x"}), 403, "Anda tidak ditugaskan untuk mereview laporan ini")
expect("laporan review via old endpoint", req("POST", f"/api/v1/proposals/{lapId}/reviews", rev1, {"catatan": "x"}), 500, "Anda tidak ditugaskan untuk mereview proposal ini")
expect("laporan finalize before save", req("POST", f"/api/v1/laporan/{lapId}/reviews/finalize", rev1), 400, "Simpan review terlebih dahulu sebelum finalisasi")
b = expect("laporan review save", req("POST", f"/api/v1/laporan/{lapId}/reviews", rev1, {"nilaiLuaran": "85", "catatan": "Luaran sesuai", "rekomendasi": "disetujui"}), 200, "Review laporan disimpan")
check("laporan review saved", b["data"]["proposalId"] == lapId and b["data"]["isDone"] is False, b["data"])
b = expect("laporan review finalize", req("POST", f"/api/v1/laporan/{lapId}/reviews/finalize", rev1), 200, "Review laporan diselesaikan")
check("laporan review done", b["data"]["isDone"] is True, b["data"])
b = expect("laporan reviews", req("GET", f"/api/v1/laporan/{lapId}/reviews", dosen1), 200, "Review laporan fetched")
check("laporan reviews shape", len(b["data"]) == 1 and list(b["data"][0]["reviewer"].keys()) == ["id", "name", "fullName"], b["data"])
b = expect("laporan detail", req("GET", f"/api/v1/laporan/{lapId}", rev1), 200, "Laporan fetched")
check("laporan detail keys", list(b["data"].keys())[-4:] == ["proposal", "anggota", "reviewerTugasan", "reviews"] and len(b["data"]["reviews"]) == 1, list(b["data"].keys()))
expect("laporan status by dosen", req("PATCH", f"/api/v1/laporan/{lapId}/status", dosen1, {"status": "disetujui"}), 403)
b = expect("laporan status disetujui", req("PATCH", f"/api/v1/laporan/{lapId}/status", ketua, {"status": "disetujui"}), 200, "Status laporan diperbarui")
check("laporan approved", b["data"]["status"] == "disetujui" and b["data"]["approvedAt"] is not None, b["data"])
n = req("GET", "/api/v1/notifications?limit=50", dosen1)[1]["data"]
check("pengusul laporan notif", any(x["type"] == "laporan_disetujui" and x["refId"] == lapId for x in n) and any(x["type"] == "review_selesai" and x["refType"] == "laporan" for x in n), n[:3])
b = expect("laporan list admin", req("GET", "/api/v1/laporan?status=disetujui&jenis=penelitian", admin), 200, "Laporan fetched")
check("laporan list", any(x["id"] == lapId for x in b["data"]) and b["meta"]["page"] == 1, b["meta"])
expect("laporan list bad query", req("GET", "/api/v1/laporan?status=x", admin), 422)
expect("laporan list forbidden", req("GET", "/api/v1/laporan", dosen1), 403)
b = expect("laporan my", req("GET", "/api/v1/laporan/my", dosen1), 200, "Laporan saya fetched")
check("laporan my has", b["data"][0]["id"] == lapId and all(x["pengusul"]["id"] == dosen1User["id"] for x in b["data"]), b["data"][:1])
expect("laporan delete non-draft", req("DELETE", f"/api/v1/laporan/{lapId}", dosen1), 400, "Hanya laporan berstatus draft yang bisa dihapus")
expect("laporan bad id", req("GET", "/api/v1/laporan/abc", dosen1), 400, "Parameter id tidak valid.")
expect("laporan missing", req("GET", "/api/v1/laporan/999999", admin), 404, "Laporan tidak ditemukan")
expect("laporan id is not proposal", req("GET", f"/api/v1/laporan/{pid}", admin), 404, "Laporan tidak ditemukan")

# pindah jenis: penelitian → pengabdian tetap memakai id yang sama
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal pindah jenis", "abstrak": abstrak, "jenis": "penelitian", "luaran": "Modul pelatihan"})
expect("create for jenis move", b, 201)
mv = b[1]["data"]["id"]
check("luaran saved", b[1]["data"]["luaran"] == "Modul pelatihan", b[1]["data"])
b = expect("move jenis", req("PATCH", f"/api/v1/dosen/proposals/{mv}", dosen5, {"jenis": "pengabdian", "judul": "Proposal pindah jenis 2"}), 200)
check("moved jenis", b["data"]["id"] == mv and b["data"]["jenis"] == "pengabdian" and b["data"]["judul"] == "Proposal pindah jenis 2" and b["data"]["luaran"] == "Modul pelatihan", b["data"])
expect("delete moved", req("DELETE", f"/api/v1/dosen/proposals/{mv}", dosen5), 200)

# notifications
b = expect("notifications", req("GET", "/api/v1/notifications?limit=2", dosen1), 200, "Notifications fetched")
check("notif shape", list(b["data"][0].keys()) == ["id", "userId", "type", "judul", "pesan", "isRead", "refId", "refType", "createdAt"] and b["meta"]["limit"] == 2, b)
nid = b["data"][0]["id"]
expect("notif read", req("PATCH", f"/api/v1/notifications/{nid}/read", dosen1), 200, "Notification marked as read")
b = req("GET", "/api/v1/notifications?onlyUnread=true&limit=100", dosen1)[1]
check("onlyUnread", all(not x["isRead"] for x in b["data"]) and nid not in [x["id"] for x in b["data"]])
expect("notif read all", req("PATCH", "/api/v1/notifications/read-all", dosen1), 200, "All notifications marked as read")
expect("notif delete", req("DELETE", f"/api/v1/notifications/{nid}", dosen1), 200, "Notification deleted")

# activity logs, dashboard, export
b = expect("my activity", req("GET", "/api/v1/activity-logs/my?limit=3", dosen1), 200, "Activity logs fetched")
check("activity shape", list(b["data"][0].keys()) == ["id", "userId", "action", "entityType", "entityId", "detail", "proposalId", "ipAddress", "userAgent", "createdAt", "proposal"], b["data"][0])
check("activity ip from X-Forwarded-For", b["data"][0]["ipAddress"].startswith("10.1."), b["data"][0])
b = expect("all activity", req("GET", f"/api/v1/activity-logs?action=proposal&userId={dosen1User['id']}", admin), 200)
check("all activity shape", list(b["data"][0].keys())[-2:] == ["user", "proposal"] and all("proposal" in x["action"] for x in b["data"]), b["data"][0])
expect("activity bad userId", req("GET", "/api/v1/activity-logs?userId=abc", admin), 500)
expect("activity forbidden", req("GET", "/api/v1/activity-logs", dosen1), 403)
b = expect("dashboard", req("GET", "/api/v1/dashboard/stats", ketua), 200, "Dashboard stats fetched")
check("dashboard shape", list(b["data"].keys()) == ["totalProposal", "perStatus", "perJenis", "perProdi", "perTahun", "users", "periodeAktif"] and list(b["data"]["users"].keys()) == ["total", "dosen", "reviewer"], b["data"])
b = expect("dashboard filtered", req("GET", "/api/v1/dashboard/stats?tahun=abc&jenis=penelitian", ketua), 200)
expect("dashboard bad jenis", req("GET", "/api/v1/dashboard/stats?jenis=x", ketua), 500)
b = expect("export", req("GET", "/api/v1/export/proposals", admin), 200, "Export data fetched")
row = [r for r in b["data"]["rows"] if r["id"] == pid][0]
check("export row", row["anggaran"] == "15.000.000,5" and row["status"] == "Disetujui" and row["jenis"] == "Penelitian" and row["reviewer"] == "Dr. Reviewer 1, M.T" and row["anggota"] == "Mahasiswa 1 (anggota)" and row["jumlahReview"] == 1 and row["reviewSelesai"] == 1, row)
check("export keys", list(b["data"].keys()) == ["total", "ringkasan", "rows", "generatedAt"] and list(row.keys()) == ["no", "id", "judul", "jenis", "status", "pengusul", "nidn", "programStudi", "periode", "anggaran", "anggota", "reviewer", "jumlahReview", "reviewSelesai", "catatanRevisi", "submittedAt", "approvedAt", "createdAt"], row)

# draft deletion (proposals route, admin)
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Draft untuk dihapus", "abstrak": abstrak, "jenis": "pengabdian"})
expect("dosen create without periode", b, 201, "Proposal berhasil dibuat")
d2 = b[1]["data"]["id"]
check("dosen create periode null", b[1]["data"]["periode"] is None and b[1]["data"]["anggota"] == [])
expect("dosen delete other", req("DELETE", f"/api/v1/dosen/proposals/{d2}", dosen1), 500, "Anda tidak memiliki akses ke proposal ini")
expect("admin delete draft", req("DELETE", f"/api/v1/proposals/{d2}", admin), 200, "Proposal deleted")
expect("dosen delete missing", req("DELETE", f"/api/v1/dosen/proposals/{d2}", dosen5), 500)

# routing / misc
expect("unknown under auth router 401", req("GET", "/api/v1/proposals/a/b/c/d"), 401, "Unauthorized")
expect("unknown under auth router 404", req("GET", "/api/v1/proposals/a/b/c/d", admin), 404)
expect("method mismatch 404", req("PUT", "/api/v1/auth/login", body={}), 404)
expect("case insensitive route", req("GET", "/API/V1/AUTH/ME", dosen1), 200)
st, _, hdrs, _ = req("OPTIONS", "/api/v1/auth/login", headers={"Origin": "http://localhost:5173"})
check("preflight", st == 204 and hdrs["Access-Control-Allow-Methods"] == "GET,POST,PUT,PATCH,DELETE", (st, dict(hdrs)))
st, b, hdrs, _ = req("GET", "/health")
etag = hdrs["ETag"]
st2, *_ = req("GET", "/api/v1/periode", dosen1)
st, b, hdrs, _ = req("GET", "/api/v1/periode", dosen1)
st3, *_ = req("GET", "/api/v1/periode", dosen1, headers={"If-None-Match": hdrs["ETag"]})
check("etag 304", st3 == 304, st3)
expect("logout-all", req("POST", "/api/v1/auth/logout-all", dosen1), 200, "Logged out from all devices")

print(f"\n{CHECKS - len(FAILS)}/{CHECKS} checks passed")
sys.exit(1 if FAILS else 0)
