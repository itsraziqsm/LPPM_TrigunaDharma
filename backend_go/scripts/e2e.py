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
rev2, _, rev2User = login("reviewer2@lppm.dev", "reviewer123")
dosen1, _, dosen1User = login("dosen1@lppm.dev", "dosen123456")
dosen2, _, dosen2User = login("dosen2@lppm.dev", "dosen123456")
dosen5, _, dosen5User = login("dosen5@lppm.dev", "dosen123456")
mhs1, _, mhs1User = login("mahasiswa1@lppm.dev", "mhs1234567")
mhs2, _, mhs2User = login("mahasiswa2@lppm.dev", "mhs1234567")
dosen3, _, dosen3User = login("dosen3@lppm.dev", "dosen123456")
dosen4, _, dosen4User = login("dosen4@lppm.dev", "dosen123456")


def terima_undangan(pid, *tokens):
    for tok in tokens:
        for i in req("GET", "/api/v1/dosen/proposals/invitations", tok)[1]["data"]:
            if i["proposal"]["id"] == pid and i["statusUndangan"] == "pending":
                req("PATCH", f"/api/v1/dosen/proposals/invitations/{i['id']}", tok, {"status": "diterima"})


def lengkapi_tim(pid, owner, jenis):
    """Tim minimal: 2 dosen (+1 mahasiswa untuk pengabdian), selain ketua pengusul."""
    ids = [{"userId": dosen3User["id"]}, {"userId": dosen4User["id"]}]
    tokens = [dosen3, dosen4]
    if jenis == "pengabdian":
        ids.append({"userId": mhs1User["id"]})
        tokens.append(mhs1)
    r = req("PATCH", f"/api/v1/dosen/proposals/{pid}", owner, {"anggotaIds": ids})
    assert r[0] == 200, r
    terima_undangan(pid, *tokens)

check("login user shape", list(adminUser.keys()) == ["id", "name", "fullName", "email", "status", "roles"], adminUser)
check("wakil roles ordered by roleId", login("wakil.ketua@lppm.dev", "wakil123456")[2]["roles"] == ["ketua_lppm", "dosen"])

# ── auth ──
expect("login wrong password", req("POST", "/api/v1/auth/login", body={"email": "admin@lppm.dev", "password": "wrongpass"}), 500, "Invalid credentials")
expect("login pending account", req("POST", "/api/v1/auth/login", body={"email": "pending.dosen@lppm.dev", "password": "pending123"}), 500, "Account not approved yet")
b = expect("login missing fields", req("POST", "/api/v1/auth/login", body={}), 422, "Validation error")
check("login missing → Required", b["errors"] == {"email": ["Required"], "password": ["Required"]}, b)
expect("bad json", req("POST", "/api/v1/auth/login", raw=b'{"x":', ctype="application/json"), 400)
b = expect("me", req("GET", "/api/v1/auth/me", dosen1), 200, "Current user")
check("me shape", list(b["data"].keys()) == ["id", "name", "fullName", "email", "status", "roles", "hasTugasan", "nidn", "nim", "prodi", "programStudi", "institusi", "kontak", "noHp", "alamat", "tempatLahir", "tanggalLahir", "jabatanFungsional", "sintaId", "sintaScore", "fotoUrl", "emailVerifiedAt"] and isinstance(b["data"]["hasTugasan"], bool), b)
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
check("search shape", len(b["data"]) == 3 and list(b["data"][0].keys()) == ["id", "name", "fullName", "email", "programStudi", "prodi", "nim", "nidn", "kontak", "noHp", "roles"], b["data"][:1])
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
# hak akses: admin hanya melihat; tambah/ubah/hapus langsung hanya Ketua LPPM
PERIODE_BARU = {"nama": "Periode Uji", "tahun": 2027, "jenis": "penelitian", "tanggalMulai": "2027-01-01", "tanggalSelesai": "2027-06-30T10:00:00+07:00"}
expect("admin create periode forbidden", req("POST", "/api/v1/periode", admin, PERIODE_BARU), 403, "Forbidden: insufficient permissions")
expect("admin list periode", req("GET", "/api/v1/periode", admin), 200, "Periode fetched")
b = expect("periode create invalid", req("POST", "/api/v1/periode", ketua, {"nama": "ab", "tahun": 1999, "jenis": "x", "tanggalMulai": "2026-13-01", "tanggalSelesai": 5}), 422)
check("periode errors", b["errors"] == {"nama": ["Nama minimal 3 karakter"], "tahun": ["Number must be greater than or equal to 2000"], "jenis": ["Invalid enum value. Expected 'penelitian' | 'pengabdian', received 'x'"], "tanggalMulai": ["Invalid datetime"], "tanggalSelesai": ["Invalid input"]}, b)
b = expect("periode create", req("POST", "/api/v1/periode", ketua, PERIODE_BARU), 201, "Periode created")
newPeriode = b["data"]["id"]
check("periode dates", b["data"]["tanggalMulai"] == "2027-01-01T00:00:00.000Z" and b["data"]["tanggalSelesai"] == "2027-06-30T03:00:00.000Z" and b["data"]["isAktif"] is True, b["data"])
b = expect("periode update", req("PATCH", f"/api/v1/periode/{newPeriode}", ketua, {"nama": "Periode Uji 2", "isAktif": False}), 200, "Periode updated")
check("periode updated", b["data"]["nama"] == "Periode Uji 2" and b["data"]["isAktif"] is False, b["data"])
expect("admin update periode forbidden", req("PATCH", f"/api/v1/periode/{newPeriode}", admin, {"nama": "Diubah Admin"}), 403, "Forbidden: insufficient permissions")
expect("admin delete langsung forbidden", req("DELETE", f"/api/v1/periode/{newPeriode}", admin, {"password": "admin123456"}), 403, "Forbidden: insufficient permissions")
expect("ketua deletion-request forbidden", req("POST", f"/api/v1/periode/{newPeriode}/deletion-request", ketua, {"password": "ketua123456"}), 403, "Forbidden: insufficient permissions")
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
expect("admin approve forbidden", req("POST", f"/api/v1/periode/deletion-request/{reqId}/approve", admin, {"password": "admin123456"}), 403, "Forbidden: insufficient permissions")
expect("approve", req("POST", f"/api/v1/periode/deletion-request/{reqId}/approve", ketua, {"password": "ketua123456"}), 200, "Periode berhasil dihapus")
expect("periode deleted", req("GET", f"/api/v1/periode/{newPeriode}", ketua), 500, "Periode tidak ditemukan")
expect("cancel missing", req("POST", f"/api/v1/periode/deletion-request/{reqId}/cancel", ketua), 500, "Permintaan penghapusan tidak ditemukan atau sudah tidak valid")
# Ketua menghapus langsung (cukup password sendiri); permintaan admin yang menunggu ikut selesai
b = expect("periode create 2", req("POST", "/api/v1/periode", ketua, dict(PERIODE_BARU, nama="Periode Uji Hapus Langsung")), 201)
p2 = b["data"]["id"]
reqId2 = req("POST", f"/api/v1/periode/{p2}/deletion-request", admin, {"password": "admin123456"})[1]["data"]["requestId"]
expect("ketua delete no password", req("DELETE", f"/api/v1/periode/{p2}", ketua, {}), 400, "Password wajib diisi")
expect("ketua delete wrong password", req("DELETE", f"/api/v1/periode/{p2}", ketua, {"password": "x"}), 500, "Password salah")
expect("ketua delete langsung", req("DELETE", f"/api/v1/periode/{p2}", ketua, {"password": "ketua123456"}), 200, "Periode berhasil dihapus")
expect("periode 2 deleted", req("GET", f"/api/v1/periode/{p2}", admin), 500, "Periode tidak ditemukan")
expect("ketua delete missing", req("DELETE", f"/api/v1/periode/{p2}", ketua, {"password": "ketua123456"}), 500, "Periode tidak ditemukan")
check("admin notified direct delete", any(x["type"] == "deletion_approved" and x["refId"] == reqId2 for x in req("GET", "/api/v1/notifications", admin)[1]["data"]))

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
check("proposal shape", list(P.keys()) == ["id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt", "tahapan", "pengusul", "periode", "anggota", "reviewerTugasan"], list(P.keys()))
check("tahapan draft", P["tahapan"] == {"kode": "seleksi_usulan", "label": "Seleksi/Usulan", "urutan": 1}, P["tahapan"])
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
check("dosen list shape", list(b["data"][0].keys()) == ["id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "catatanRevisi", "dokumenUrl", "submittedAt", "approvedAt", "createdAt", "updatedAt", "tahapan", "pengusul", "periode", "anggota", "reviewerTugasan"] and "statusUndangan" in b["data"][0]["anggota"][0] and list(b["data"][0]["periode"].keys()) == ["id", "nama", "tahun", "jenis"], b["data"][0])
expect("dosen list bad status", req("GET", "/api/v1/dosen/proposals?status=x", dosen1), 500)
b = expect("dosen stats", req("GET", "/api/v1/dosen/proposals/stats", dosen1), 200, "Stats fetched")
check("stats shape", list(b["data"].keys()) == ["total", "draft", "diajukan", "disetujui", "revisi", "ditolak", "review"] and b["data"]["total"] == sum(v for k, v in b["data"].items() if k != "total"), b)
expect("members search short", req("GET", "/api/v1/dosen/proposals/members/search?q=a", dosen1), 400, "Ketik minimal 2 karakter untuk mencari pengguna")
b = expect("members search", req("GET", "/api/v1/dosen/proposals/members/search?q=mahasiswa", dosen1), 200, "Users fetched")
check("members shape", len(b["data"]) <= 10 and list(b["data"][0].keys()) == ["id", "name", "fullName", "email", "nidn", "nim", "programStudi", "prodi", "kontak", "noHp", "roles"], b["data"][:1])
expect("dosen get other", req("GET", f"/api/v1/dosen/proposals/{pid}", dosen2), 500, "Anda tidak memiliki akses ke proposal ini")
b = expect("dosen get", req("GET", f"/api/v1/dosen/proposals/{pid}", dosen1), 200, "Proposal fetched")
check("dosen detail keys", list(b["data"].keys())[-3:] == ["reviews", "laporan", "dokumenLampiran"])
expect("dosen submit with rejected member", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", dosen1), 500, "Proposal tidak dapat diajukan: 1 anggota menolak undangan. Semua anggota harus menyetujui undangan terlebih dahulu.")
b = expect("dosen update", req("PATCH", f"/api/v1/dosen/proposals/{pid}", dosen1, {"judul": "Sistem Uji Coba Golang", "anggotaIds": [{"userId": mhs1User["id"], "peran": "anggota"}]}), 200, "Proposal berhasil diperbarui")
check("update reset anggota", len(b["data"]["anggota"]) == 1 and b["data"]["anggota"][0]["statusUndangan"] == "pending", b["data"]["anggota"])
# komposisi tim: penelitian minimal 2 dosen (selain ketua), mahasiswa opsional
terima_undangan(pid, mhs1)
expect("submit tim kurang dosen", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", dosen1), 400, "Proposal penelitian belum dapat diajukan: tim wajib memiliki minimal 2 anggota dosen (sekarang 0), selain ketua pengusul.")
expect("submit tim kurang dosen (proposals)", req("POST", f"/api/v1/proposals/{pid}/submit", dosen1), 400, "Proposal penelitian belum dapat diajukan: tim wajib memiliki minimal 2 anggota dosen (sekarang 0), selain ketua pengusul.")
b = expect("dosen update tim", req("PATCH", f"/api/v1/dosen/proposals/{pid}", dosen1, {"anggotaIds": [{"userId": mhs1User["id"], "peran": "anggota"}, {"userId": dosen3User["id"]}, {"userId": dosen4User["id"]}]}), 200)
check("update tim anggota", len(b["data"]["anggota"]) == 3, b["data"]["anggota"])
terima_undangan(pid, dosen3, dosen4)
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
expect("create laporan by mahasiswa forbidden", req("POST", f"/api/v1/proposals/{pid}/laporan", mhs1, raw=body, ctype=ct), 403, "Forbidden: insufficient permissions")
body, ct = multipart({"jenis": "kemajuan", "judul": "Laporan Kemajuan", "keterangan": "ok"}, ("file", "lap.pdf", "application/pdf", PDF))
b = expect("create laporan", req("POST", f"/api/v1/proposals/{pid}/laporan", dosen1, raw=body, ctype=ct), 201, "Laporan diunggah")
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
expect("create dokumen by mahasiswa forbidden", req("POST", f"/api/v1/proposals/{pid}/dokumen", mhs1, raw=body, ctype=ct), 403)
b = expect("create dokumen file", req("POST", f"/api/v1/proposals/{pid}/dokumen", dosen1, raw=body, ctype=ct), 201)
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
LAP_KEYS = ["id", "tipe", "proposalId", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "luaranTercapai", "ringkasanHasil", "realisasiAnggaran", "metodePenelitian", "catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt", "pengusul", "periode", "proposal", "reviewerTugasan"]
b = expect("laporan eligible", req("GET", "/api/v1/laporan/eligible", dosen1), 200, "Proposal siap dilaporkan fetched")
check("laporan eligible has pid", any(x["id"] == pid for x in b["data"]) and list(b["data"][0].keys()) == ["id", "judul", "jenis", "status", "anggaran", "luaran", "approvedAt", "periode"], b["data"][:1])
expect("laporan create invalid", req("POST", "/api/v1/laporan", dosen1, {"proposalId": 0}), 422)
expect("laporan create by mahasiswa", req("POST", "/api/v1/laporan", mhs1, {"proposalId": pid}), 403, "Forbidden: insufficient permissions")
expect("laporan create by non-pengusul", req("POST", "/api/v1/laporan", dosen2, {"proposalId": pid}), 403, "Hanya pengusul proposal yang dapat membuat laporan")
expect("laporan create missing proposal", req("POST", "/api/v1/laporan", dosen1, {"proposalId": 999999}), 404, "Proposal tidak ditemukan")
expect("laporan create forbidden role", req("POST", "/api/v1/laporan", admin, {"proposalId": pid}), 403)
b = expect("laporan create", req("POST", "/api/v1/laporan", dosen1, {"proposalId": pid, "ringkasanHasil": "Ringkas"}), 201, "Laporan berhasil dibuat")
L = b["data"]
lapId = L["id"]
check("laporan shape", list(L.keys()) == LAP_KEYS, list(L.keys()))
check("laporan values", L["tipe"] == "laporan" and L["proposalId"] == pid and L["status"] == "draft" and L["jenis"] == "penelitian" and L["anggaran"] == "15000000.5" and L["proposal"]["id"] == pid and lapId != pid, L)
tah = lambda: req("GET", f"/api/v1/dosen/proposals/{pid}", dosen1)[1]["data"]["tahapan"]["kode"]
check("tahapan pelaksanaan", tah() == "pelaksanaan", tah())
expect("laporan create duplicate", req("POST", "/api/v1/laporan", dosen1, {"proposalId": pid}), 409, "Proposal ini sudah memiliki laporan")
b = expect("laporan eligible after", req("GET", "/api/v1/laporan/eligible", dosen1), 200)
check("laporan eligible excludes pid", all(x["id"] != pid for x in b["data"]), b["data"])
expect("laporan via old proposal endpoint", req("GET", f"/api/v1/proposals/{lapId}", admin), 500, "Proposal tidak ditemukan")
b = req("GET", "/api/v1/proposals/my?limit=100", dosen1)[1]
check("old my proposals excludes laporan", all(x["tipe"] == "proposal" and x["id"] != lapId for x in b["data"]), [x["id"] for x in b["data"]])
expect("laporan submit incomplete", req("POST", f"/api/v1/laporan/{lapId}/submit", dosen1), 400, "Luaran tercapai wajib diisi sebelum laporan diajukan")
expect("laporan update by mahasiswa", req("PATCH", f"/api/v1/laporan/{lapId}", mhs1, {"luaranTercapai": "x"}), 403, "Forbidden: insufficient permissions")
expect("laporan update by anggota", req("PATCH", f"/api/v1/laporan/{lapId}", dosen2, {"luaranTercapai": "x"}), 403, "Anda tidak memiliki akses ke laporan ini")
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
check("tahapan seleksi lanjutan", tah() == "seleksi_lanjutan", tah())
n = req("GET", "/api/v1/notifications?limit=50", ketua)[1]["data"]
check("ketua laporan notif", any(x["type"] == "laporan_diajukan" and x["refId"] == lapId and x["refType"] == "laporan" for x in n), n[:3])
expect("laporan edit after submit", req("PATCH", f"/api/v1/laporan/{lapId}", dosen1, {"ringkasanHasil": "x"}), 400, "Laporan hanya bisa diubah saat status draft atau revisi")
expect("laporan assign pengusul", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [dosen1User["id"]]}), 400, "Pengusul tidak dapat menjadi reviewer laporannya sendiri")
expect("laporan assign missing user", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [999999]}), 400, "Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer")
b = expect("laporan assign", req("POST", f"/api/v1/laporan/{lapId}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]}), 200, "Reviewer laporan ditugaskan")
check("laporan review status", b["data"]["status"] == "review" and b["data"]["reviewerTugasan"][0]["reviewer"]["id"] == rev1User["id"], b["data"])
b = expect("laporan tugasan", req("GET", "/api/v1/laporan/tugasan", rev1), 200, "Tugasan review laporan fetched")
t = b["data"][0]
check("laporan tugasan shape", list(t.keys()) == ["id", "laporanId", "reviewerId", "createdAt", "laporan", "myReview"] and t["laporanId"] == lapId and t["myReview"] is None and list(t["laporan"].keys()) == ["id", "proposalId", "judul", "status", "jenis", "pengusul"], t)
b = req("GET", "/api/v1/reviewer/my-tugasan?limit=100", rev1)[1]
check("old my-tugasan excludes laporan", all(x["proposalId"] != lapId and x["proposal"] is not None for x in b["data"]), b["data"][:1])
expect("laporan review without reviewer role", req("POST", f"/api/v1/laporan/{lapId}/reviews", dosen5, {"catatan": "x"}), 403, "Anda tidak memiliki peran reviewer")
expect("laporan review not assigned", req("POST", f"/api/v1/laporan/{lapId}/reviews", rev2, {"catatan": "x"}), 403, "Anda tidak ditugaskan untuk mereview laporan ini")
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
check("tahapan pasca", tah() == "pasca_pelaksanaan", tah())
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
expect("mitra on penelitian", req("PATCH", f"/api/v1/dosen/proposals/{mv}", dosen5, {"mitra": "Desa X"}), 400, "Mitra hanya untuk proposal pengabdian")
b = expect("skema on penelitian", req("PATCH", f"/api/v1/dosen/proposals/{mv}", dosen5, {"skema": "Penelitian Dosen Pemula"}), 200)
check("skema saved", b["data"]["skema"] == "Penelitian Dosen Pemula" and b["data"]["mitra"] is None, b["data"])
expect("skema on pengabdian move", req("PATCH", f"/api/v1/dosen/proposals/{mv}", dosen5, {"jenis": "pengabdian", "skema": "x"}), 400, "Skema hanya untuk proposal penelitian")
b = expect("move jenis", req("PATCH", f"/api/v1/dosen/proposals/{mv}", dosen5, {"jenis": "pengabdian", "judul": "Proposal pindah jenis 2", "mitra": "Desa Sukamaju"}), 200)
check("move drops skema, sets mitra", b["data"]["skema"] is None and b["data"]["mitra"] == "Desa Sukamaju", b["data"])
check("moved jenis", b["data"]["id"] == mv and b["data"]["jenis"] == "pengabdian" and b["data"]["judul"] == "Proposal pindah jenis 2" and b["data"]["luaran"] == "Modul pelatihan", b["data"])
expect("delete moved", req("DELETE", f"/api/v1/dosen/proposals/{mv}", dosen5), 200)

# ── grup A waiting API (W-08, W-09, W-11, W-16, W-17, W-19) ──
PROFILE_KEYS = ["id", "email", "name", "fullName", "status", "nidn", "nim", "prodi", "programStudi", "institusi", "kontak", "noHp", "alamat", "tempatLahir", "tanggalLahir", "jabatanFungsional", "sintaId", "sintaScore", "fotoUrl", "emailVerifiedAt", "createdAt", "roles"]
b = expect("profile me", req("GET", "/api/v1/users/profile/me", dosen1), 200, "Profile fetched")
check("profile me shape", list(b["data"].keys()) == PROFILE_KEYS and b["data"]["id"] == dosen1User["id"], list(b["data"].keys()))
b = expect("profile jabatan", req("PATCH", "/api/v1/users/profile/me", dosen1, {"jabatanFungsional": "Lektor"}), 200, "Profile updated")
check("profile patch shape", list(b["data"].keys()) == PROFILE_KEYS and b["data"]["jabatanFungsional"] == "Lektor", b["data"])
b = req("GET", "/api/v1/auth/me", dosen1)[1]
check("me has profile", b["data"]["jabatanFungsional"] == "Lektor" and b["data"]["nidn"] == "0100000001", b["data"])
expect("profile me no token", req("GET", "/api/v1/users/profile/me"), 401)
b = expect("stats jenis", req("GET", "/api/v1/dosen/proposals/stats?jenis=pengabdian", dosen1), 200, "Stats fetched")
b2 = req("GET", "/api/v1/dosen/proposals?jenis=pengabdian&limit=1", dosen1)[1]
check("stats jenis total", b["data"]["total"] == b2["meta"]["total"], (b["data"], b2["meta"]))
expect("stats bad jenis", req("GET", "/api/v1/dosen/proposals/stats?jenis=x", dosen1), 422)
b = expect("as-member", req("GET", "/api/v1/dosen/proposals/as-member?jenis=penelitian", mhs1), 200, "Proposals as member fetched")
check("as-member has pid", any(x["id"] == pid for x in b["data"]) and all(x["pengusul"]["id"] != mhs1User["id"] for x in b["data"]) and "meta" in b, b["data"][:1])
b = expect("as-member owner", req("GET", "/api/v1/dosen/proposals/as-member", dosen1), 200)
check("as-member excludes own", all(x["pengusul"]["id"] != dosen1User["id"] for x in b["data"]), b["data"][:1])
expect("as-member bad status", req("GET", "/api/v1/dosen/proposals/as-member?status=x", mhs1), 422)
expect("as-member forbidden", req("GET", "/api/v1/dosen/proposals/as-member", admin), 403)
b = expect("prodi public list", req("GET", "/api/v1/program-studi"), 200, "Program studi fetched")
check("prodi shape", len(b["data"]) > 0 and list(b["data"][0].keys()) == ["id", "nama", "jenjang", "isAktif", "createdAt", "updatedAt"], b["data"][:1])
psName = "Prodi Uji " + uuid.uuid4().hex[:6]
expect("prodi create invalid", req("POST", "/api/v1/program-studi", admin, {"nama": " "}), 422)
expect("prodi create forbidden", req("POST", "/api/v1/program-studi", dosen1, {"nama": psName}), 403)
expect("prodi create no token", req("POST", "/api/v1/program-studi", body={"nama": psName}), 401)
b = expect("prodi create", req("POST", "/api/v1/program-studi", admin, {"nama": " " + psName + " ", "jenjang": "S1"}), 201, "Program studi berhasil dibuat")
ps = b["data"]
check("prodi created", ps["nama"] == psName and ps["jenjang"] == "S1" and ps["isAktif"] is True, ps)
expect("prodi duplicate", req("POST", "/api/v1/program-studi", admin, {"nama": psName}), 409, "Resource already exists")
b = expect("prodi deactivate", req("PATCH", f"/api/v1/program-studi/{ps['id']}", admin, {"isAktif": False, "jenjang": ""}), 200, "Program studi berhasil diperbarui")
check("prodi deactivated", b["data"]["isAktif"] is False and b["data"]["jenjang"] is None, b["data"])
b = req("GET", "/api/v1/program-studi")[1]
check("prodi hidden when inactive", all(x["id"] != ps["id"] for x in b["data"]))
b = req("GET", "/api/v1/program-studi?semua=true")[1]
check("prodi semua", any(x["id"] == ps["id"] for x in b["data"]))
expect("prodi delete", req("DELETE", f"/api/v1/program-studi/{ps['id']}", admin), 200, "Program studi berhasil dihapus")
expect("prodi delete missing", req("DELETE", f"/api/v1/program-studi/{ps['id']}", admin), 404, "Program studi tidak ditemukan")

# ── grup B waiting API (W-04, W-07, W-20, W-21; W-03 dicek di alur laporan) ──
b = expect("sinta save", req("PATCH", "/api/v1/users/profile/me", dosen1, {"sintaId": "6012345", "sintaScore": 120}), 200, "Profile updated")
check("sinta saved", b["data"]["sintaId"] == "6012345" and b["data"]["sintaScore"] == 120, b["data"])
expect("sinta negative", req("PATCH", "/api/v1/users/profile/me", dosen1, {"sintaScore": -1}), 400, "sintaScore harus bilangan bulat 0 atau lebih")
expect("sinta text", req("PATCH", "/api/v1/users/profile/me", dosen1, {"sintaScore": "abc"}), 400)
b = expect("sinta string number", req("PATCH", "/api/v1/users/profile/me", dosen1, {"sintaScore": "245"}), 200)
check("sinta string saved", b["data"]["sintaScore"] == 245, b["data"])
check("me sinta", req("GET", "/api/v1/auth/me", dosen1)[1]["data"]["sintaScore"] == 245)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
body, ct = multipart({}, ("file", "foto.png", "image/png", PNG))
b = expect("foto upload", req("POST", "/api/v1/users/profile/foto", dosen1, raw=body, ctype=ct), 200, "Foto profil berhasil diperbarui")
fotoUrl = b["data"]["fotoUrl"]
check("foto upload shape", list(b["data"].keys()) == ["fotoUrl", "fotoMime", "fotoUkuran"] and fotoUrl.startswith(f"/users/{dosen1User['id']}/foto?v=") and b["data"]["fotoMime"] == "image/png", b["data"])
check("me fotoUrl", req("GET", "/api/v1/auth/me", dosen1)[1]["data"]["fotoUrl"] == fotoUrl)
check("profile fotoUrl", req("GET", "/api/v1/users/profile/me", dosen1)[1]["data"]["fotoUrl"] == fotoUrl)
st, _, hdrs, content = req("GET", "/api/v1" + fotoUrl)
check("foto public get", st == 200 and content == PNG and hdrs["Content-Type"] == "image/png" and hdrs["Cross-Origin-Resource-Policy"] == "cross-origin", (st, dict(hdrs)))
body, ct = multipart({}, ("file", "x.pdf", "application/pdf", PDF))
expect("foto pdf mimetype", req("POST", "/api/v1/users/profile/foto", dosen1, raw=body, ctype=ct), 400, "Foto harus berformat JPG, PNG, atau WebP.")
body, ct = multipart({}, ("file", "x.png", "image/png", PDF))
expect("foto fake png", req("POST", "/api/v1/users/profile/foto", dosen1, raw=body, ctype=ct), 400, "Isi file bukan gambar JPG, PNG, atau WebP yang valid.")
body, ct = multipart({}, ("file", "big.png", "image/png", PNG + b"\x00" * (2 * 1024 * 1024)))
expect("foto too large", req("POST", "/api/v1/users/profile/foto", dosen1, raw=body, ctype=ct), 400, "Ukuran foto maksimal 2 MB.")
expect("foto no file", req("POST", "/api/v1/users/profile/foto", dosen1, {}), 400, "File foto tidak ditemukan dalam request.")
expect("foto delete", req("DELETE", "/api/v1/users/profile/foto", dosen1), 200, "Foto profil dihapus")
expect("foto delete again", req("DELETE", "/api/v1/users/profile/foto", dosen1), 404, "Foto profil belum ada")
expect("foto gone", req("GET", f"/api/v1/users/{dosen1User['id']}/foto"), 404, "Foto tidak ditemukan")
check("me fotoUrl null", req("GET", "/api/v1/auth/me", dosen1)[1]["data"]["fotoUrl"] is None)
expect("foto bad id", req("GET", "/api/v1/users/abc/foto"), 400)
st, b, hdrs, _ = req("GET", "/api/v1/users/profile/export", dosen1)
check("export account", st == 200 and hdrs["Content-Disposition"] == f'attachment; filename="data-akun-{dosen1User["id"]}.json"' and list(b.keys()) == ["exportedAt", "profil", "proposal", "laporan", "keanggotaan", "laporanHarian", "review", "notifikasi", "aktivitas"] and len(b["proposal"]) > 0, (st, list(b.keys()) if isinstance(b, dict) else b))
expect("export no token", req("GET", "/api/v1/users/profile/export"), 401)
# hapus akun: daftar → disetujui admin → login → hapus
delEmail = f"hapus{uuid.uuid4().hex[:6]}@lppm.dev"
b = expect("register for delete", req("POST", "/api/v1/auth/register/mahasiswa", body={"email": delEmail, "name": "Akan Dihapus", "password": "password123", "nim": "99" + uuid.uuid4().hex[:8]}), 201)
delId = b["data"]["id"]
expect("approve for delete", req("PATCH", f"/api/v1/users/{delId}/status", admin, {"status": "approved"}), 200)
st, b, *_ = req("POST", "/api/v1/auth/login", body={"email": delEmail, "password": "password123"})
delTok, delRefresh = b["data"]["accessToken"], b["data"]["refreshToken"]
expect("delete account no password", req("DELETE", "/api/v1/users/profile/me", delTok, {}), 422)
expect("delete account wrong password", req("DELETE", "/api/v1/users/profile/me", delTok, {"password": "salah12345"}), 400, "Password salah")
expect("delete account", req("DELETE", "/api/v1/users/profile/me", delTok, {"password": "password123"}), 200, "Akun berhasil dihapus")
expect("deleted cannot login", req("POST", "/api/v1/auth/login", body={"email": delEmail, "password": "password123"}), 500, "Invalid credentials")
expect("deleted refresh revoked", req("POST", "/api/v1/auth/refresh", body={"refreshToken": delRefresh}), 500, "Refresh token invalid or expired")
b = req("GET", f"/api/v1/users/{delId}", admin)[1]["data"]
check("deleted anonymised", b["name"] == "Pengguna Dihapus" and b["email"] == f"deleted-{delId}@deleted.invalid" and b["status"] == "rejected" and b["nim"] is None, b)
admins = req("GET", "/api/v1/users?role=admin&status=approved", admin)[1]["meta"]["total"]
if admins == 1:
    expect("delete last admin", req("DELETE", "/api/v1/users/profile/me", admin, {"password": "admin123456"}), 400, "Akun admin terakhir tidak dapat dihapus")

# ── grup C waiting API (W-01/W-02/W-12 luaran, W-06 kepercayaan, W-18 verifikasi email) ──
LUARAN_KEYS = ["id", "proposalId", "jenis", "target", "targetTanggal", "status", "judulCapaian", "keterangan", "tercapaiAt", "buktiUrl", "buktiNama", "buktiMime", "buktiUkuran", "createdAt", "updatedAt", "tepatWaktu"]
statsBefore = req("GET", "/api/v1/luaran/stats", dosen5)[1]["data"]
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal dengan luaran", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen})
expect("luaran proposal", b, 201)
lp = b[1]["data"]["id"]
expect("luaran create invalid", req("POST", "/api/v1/luaran", dosen5, {"proposalId": lp, "jenis": "x", "target": "a"}), 422)
expect("luaran create other user", req("POST", "/api/v1/luaran", dosen1, {"proposalId": lp, "jenis": "jurnal", "target": "Jurnal SINTA 3"}), 403, "Hanya pengusul proposal yang dapat mengubah luaran")
b = expect("luaran create", req("POST", "/api/v1/luaran", dosen5, {"proposalId": lp, "jenis": "jurnal", "target": "Jurnal SINTA 3", "targetTanggal": "2099-12-31"}), 201, "Luaran berhasil ditambahkan")
lj = b["data"]
check("luaran shape", list(lj.keys()) == LUARAN_KEYS and lj["status"] == "belum" and lj["targetTanggal"] == "2099-12-31T00:00:00.000Z" and lj["tepatWaktu"] is None, lj)
b = expect("luaran create 2", req("POST", "/api/v1/luaran", dosen5, {"proposalId": lp, "jenis": "hki", "target": "Hak cipta aplikasi"}), 201)
lh = b["data"]["id"]
b = expect("luaran update target", req("PATCH", f"/api/v1/luaran/{lh}", dosen5, {"target": "Hak cipta program komputer", "targetTanggal": None}), 200, "Luaran berhasil diperbarui")
check("luaran updated", b["data"]["target"] == "Hak cipta program komputer" and b["data"]["targetTanggal"] is None, b["data"])
expect("luaran capaian before approved", req("PATCH", f"/api/v1/luaran/{lj['id']}/capaian", dosen5, {"status": "tercapai"}), 400, "Capaian luaran hanya bisa diisi setelah proposal disetujui")
b = expect("luaran list", req("GET", f"/api/v1/luaran/proposal/{lp}", dosen5), 200, "Luaran fetched")
check("luaran list items", [x["id"] for x in b["data"]] == [lj["id"], lh], b["data"])
expect("luaran list stranger", req("GET", f"/api/v1/luaran/proposal/{lp}", mhs2), 403)
expect("luaran list missing", req("GET", "/api/v1/luaran/proposal/999999", admin), 404, "Proposal tidak ditemukan")
expect("luaran delete", req("DELETE", f"/api/v1/luaran/{lh}", dosen5), 200, "Luaran berhasil dihapus")
expect("luaran delete missing", req("DELETE", f"/api/v1/luaran/{lh}", dosen5), 404, "Luaran tidak ditemukan")
lengkapi_tim(lp, dosen5, "penelitian")
expect("luaran submit proposal (penelitian tanpa mahasiswa)", req("POST", f"/api/v1/dosen/proposals/{lp}/submit", dosen5), 200)
expect("luaran target locked", req("PATCH", f"/api/v1/luaran/{lj['id']}", dosen5, {"target": "Jurnal SINTA 2"}), 400, "Target luaran hanya bisa diubah saat proposal berstatus draft atau revisi")
expect("luaran approve proposal", req("PATCH", f"/api/v1/proposals/{lp}/status", ketua, {"status": "disetujui"}), 200)
expect("luaran capaian bad url", req("PATCH", f"/api/v1/luaran/{lj['id']}/capaian", dosen5, {"buktiUrl": "bukan-url"}), 422)
b = expect("luaran capaian", req("PATCH", f"/api/v1/luaran/{lj['id']}/capaian", dosen5, {"status": "tercapai", "judulCapaian": "Artikel di Jurnal X", "buktiUrl": "https://jurnal.example/artikel/1"}), 200, "Capaian luaran berhasil disimpan")
check("luaran tercapai", b["data"]["status"] == "tercapai" and b["data"]["tercapaiAt"] is not None and b["data"]["tepatWaktu"] is True, b["data"])
body, ct = multipart({}, ("file", "bukti.pdf", "application/pdf", PDF))
b = expect("luaran bukti upload", req("POST", f"/api/v1/luaran/{lj['id']}/bukti", dosen5, raw=body, ctype=ct), 200, "Bukti luaran berhasil diunggah")
check("luaran bukti meta", b["data"]["buktiNama"] == "bukti.pdf" and b["data"]["buktiMime"] == "application/pdf", b["data"])
body, ct = multipart({}, ("file", "x.png", "image/png", FAKE))
expect("luaran bukti fake", req("POST", f"/api/v1/luaran/{lj['id']}/bukti", dosen5, raw=body, ctype=ct), 400, "Isi file bukti bukan PDF, DOCX, JPG, PNG, atau WebP yang valid.")
st, _, hdrs, content = req("GET", f"/api/v1/luaran/{lj['id']}/bukti", ketua)
check("luaran bukti download", st == 200 and content == PDF, st)
b = expect("luaran stats", req("GET", "/api/v1/luaran/stats", dosen5), 200, "Statistik luaran fetched")
check("luaran stats shape", list(b["data"].keys()) == ["total", "tercapai", "dapatDiklaim", "jurnal", "perJenis"] and list(b["data"]["perJenis"].keys()) == ["jurnal", "prosiding", "hki", "buku", "produk", "media_massa", "lainnya"], b["data"])
check("luaran not yet claimable", b["data"]["tercapai"] == statsBefore["tercapai"] + 1 and b["data"]["dapatDiklaim"] == statsBefore["dapatDiklaim"], (statsBefore, b["data"]))
# laporan → disetujui → luaran dapat diklaim
b = expect("luaran laporan", req("POST", "/api/v1/laporan", dosen5, {"proposalId": lp, "luaranTercapai": "1 artikel jurnal", "dokumenUrl": "https://drive.example/lap"}), 201)
llap = b["data"]["id"]
expect("luaran laporan submit", req("POST", f"/api/v1/laporan/{llap}/submit", dosen5), 200)
expect("luaran capaian locked", req("PATCH", f"/api/v1/luaran/{lj['id']}/capaian", dosen5, {"keterangan": "x"}), 400, "Capaian luaran tidak bisa diubah karena laporan sudah diajukan")
expect("luaran laporan assign", req("POST", f"/api/v1/laporan/{llap}/reviewers", ketua, {"reviewerIds": [rev1User["id"]]}), 200)
expect("luaran laporan review", req("POST", f"/api/v1/laporan/{llap}/reviews", rev1, {"rekomendasi": "revisi"}), 200)
expect("luaran laporan finalize", req("POST", f"/api/v1/laporan/{llap}/reviews/finalize", rev1), 200)
expect("luaran laporan approve", req("PATCH", f"/api/v1/laporan/{llap}/status", ketua, {"status": "disetujui"}), 200)
b = req("GET", "/api/v1/luaran/stats", dosen5)[1]["data"]
check("luaran claimable", b["dapatDiklaim"] == statsBefore["dapatDiklaim"] + 1 and b["jurnal"] == statsBefore["jurnal"] + 1, (statsBefore, b))
# nilai kepercayaan
b = expect("kepercayaan", req("GET", "/api/v1/dosen/kepercayaan", dosen5), 200, "Nilai kepercayaan fetched")
k = b["data"]
check("kepercayaan shape", list(k.keys()) == ["userId", "nilai", "skala", "komponen", "dihitungPada"] and k["skala"] == 5 and [x["kode"] for x in k["komponen"]] == ["persetujuan_proposal", "persetujuan_laporan", "rekomendasi_reviewer", "ketepatan_waktu"] and list(k["komponen"][0].keys()) == ["kode", "label", "bobot", "nilai", "pembilang", "penyebut", "keterangan"], k)
check("kepercayaan values", 0 <= k["nilai"] <= 5 and all(x["nilai"] is not None for x in k["komponen"]) and k["komponen"][3]["pembilang"] >= 1, k)
b = expect("kepercayaan admin other", req("GET", f"/api/v1/dosen/kepercayaan?userId={dosen5User['id']}", admin), 200)
check("kepercayaan admin same", b["data"]["nilai"] == k["nilai"] and b["data"]["userId"] == dosen5User["id"], b["data"])
expect("kepercayaan dosen other", req("GET", f"/api/v1/dosen/kepercayaan?userId={dosen5User['id']}", dosen1), 403)
expect("kepercayaan reviewer only", req("GET", "/api/v1/dosen/kepercayaan", rev1), 403, "Forbidden: insufficient permissions")
# verifikasi email
check("seed user verified", req("GET", "/api/v1/auth/me", dosen1)[1]["data"]["emailVerifiedAt"] is not None)
expect("resend already verified", req("POST", "/api/v1/auth/verify-email/resend", dosen1), 400, "Email sudah terverifikasi")
veEmail = f"verif{uuid.uuid4().hex[:6]}@lppm.dev"
b = expect("register for verify", req("POST", "/api/v1/auth/register/mahasiswa", body={"email": veEmail, "name": "Perlu Verifikasi", "password": "password123", "nim": "98" + uuid.uuid4().hex[:8]}), 201)
expect("approve for verify", req("PATCH", f"/api/v1/users/{b['data']['id']}/status", admin, {"status": "approved"}), 200)
veTok = req("POST", "/api/v1/auth/login", body={"email": veEmail, "password": "password123"})[1]["data"]["accessToken"]
check("new user unverified", req("GET", "/api/v1/auth/me", veTok)[1]["data"]["emailVerifiedAt"] is None)
expect("resend verification", req("POST", "/api/v1/auth/verify-email/resend", veTok), 200, "Email verifikasi telah dikirim ke " + veEmail)
expect("resend no token", req("POST", "/api/v1/auth/verify-email/resend"), 401)
expect("verify empty", req("POST", "/api/v1/auth/verify-email", body={}), 422)
expect("verify bad token", req("POST", "/api/v1/auth/verify-email", body={"token": "salah"}), 400, "Token verifikasi tidak valid atau kedaluwarsa")

# ── W-22 sampai W-25 (rumpun ilmu, bidang, kontak anggota, kata kunci, master luaran) ──
b = expect("master rumpun ilmu", req("GET", "/api/v1/master/rumpun-ilmu", dosen1), 200, "Master data fetched")
check("master rumpun shape", len(b["data"]) >= 12 and list(b["data"][0].keys()) == ["id", "nama", "jenisKegiatan", "jenisLuaran", "urutan", "isAktif", "createdAt", "updatedAt"], b["data"][:1])
b = req("GET", "/api/v1/master/bidang?jenis=pengabdian", dosen1)[1]["data"]
check("master bidang jenis", len(b) > 0 and all(x["jenisKegiatan"] in (None, "pengabdian") for x in b), b[:2])
b = req("GET", "/api/v1/master/luaran?jenis=penelitian", dosen1)[1]["data"]
check("master luaran", b[0]["nama"] == "Artikel jurnal nasional terakreditasi (SINTA)" and b[0]["jenisLuaran"] == "jurnal" and all(x["jenisKegiatan"] in (None, "penelitian") for x in b), b[:2])
expect("master unknown", req("GET", "/api/v1/master/xyz", dosen1), 404)
expect("master bad jenis", req("GET", "/api/v1/master/bidang?jenis=x", dosen1), 400)
expect("master no token", req("GET", "/api/v1/master/bidang"), 401)
mName = "Bidang Uji " + uuid.uuid4().hex[:6]
expect("master create forbidden", req("POST", "/api/v1/master/bidang", dosen1, {"nama": mName}), 403)
expect("master jenisLuaran on bidang", req("POST", "/api/v1/master/bidang", admin, {"nama": mName, "jenisLuaran": "jurnal"}), 400, "jenisLuaran hanya untuk master luaran")
b = expect("master create", req("POST", "/api/v1/master/bidang", admin, {"nama": mName, "jenisKegiatan": "penelitian", "urutan": 99}), 201, "Master data berhasil dibuat")
mid = b["data"]["id"]
expect("master duplicate", req("POST", "/api/v1/master/bidang", admin, {"nama": mName}), 409)
b = expect("master update", req("PATCH", f"/api/v1/master/bidang/{mid}", admin, {"isAktif": False, "jenisKegiatan": None}), 200, "Master data berhasil diperbarui")
check("master updated", b["data"]["isAktif"] is False and b["data"]["jenisKegiatan"] is None, b["data"])
check("master inactive hidden", all(x["id"] != mid for x in req("GET", "/api/v1/master/bidang", dosen1)[1]["data"]))
check("master semua", any(x["id"] == mid for x in req("GET", "/api/v1/master/bidang?semua=true", admin)[1]["data"]))
expect("master wrong kategori id", req("PATCH", f"/api/v1/master/luaran/{mid}", admin, {"urutan": 1}), 404, "Master data tidak ditemukan")
expect("master delete", req("DELETE", f"/api/v1/master/bidang/{mid}", admin), 200, "Master data berhasil dihapus")
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal rumpun dan kata kunci", "abstrak": abstrak, "jenis": "penelitian", "rumpunIlmu": "Ilmu Teknik", "bidang": "Teknologi Informasi dan Komunikasi", "kataKunci": [" sistem informasi ", "IoT", "iot", ""]})
expect("create with kata kunci", b, 201)
kp = b[1]["data"]
check("kata kunci saved", kp["rumpunIlmu"] == "Ilmu Teknik" and kp["bidang"] == "Teknologi Informasi dan Komunikasi" and kp["kataKunci"] == ["sistem informasi", "IoT"], kp)
expect("kata kunci too many", req("PATCH", f"/api/v1/dosen/proposals/{kp['id']}", dosen5, {"kataKunci": [f"k{i}" for i in range(11)]}), 422)
expect("kata kunci not array", req("PATCH", f"/api/v1/dosen/proposals/{kp['id']}", dosen5, {"kataKunci": "a,b"}), 422)
b = expect("kata kunci clear", req("PATCH", f"/api/v1/dosen/proposals/{kp['id']}", dosen5, {"kataKunci": []}), 200)
check("kata kunci empty array", b["data"]["kataKunci"] == [] and b["data"]["rumpunIlmu"] == "Ilmu Teknik", b["data"])
b = req("GET", f"/api/v1/proposals/{pid}", dosen1)[1]["data"]
check("anggota user kontak", list(b["anggota"][0]["user"].keys()) == ["id", "name", "fullName", "email", "kontak", "noHp"] and "alamat" not in b["anggota"][0]["user"], b["anggota"][0])
expect("delete kata kunci proposal", req("DELETE", f"/api/v1/dosen/proposals/{kp['id']}", dosen5), 200)

# ── W-26 detail mitra pengabdian ──
b = expect("master jenis mitra", req("GET", "/api/v1/master/jenis-mitra?jenis=pengabdian", dosen1), 200, "Master data fetched")
check("master jenis mitra isi", len(b["data"]) >= 9 and b["data"][0]["nama"] == "Kelompok masyarakat", b["data"][:2])
MITRA = {"mitra": "Kelompok Tani Sukamaju", "mitraJenis": "Kelompok masyarakat", "mitraAlamat": "Desa Sukamaju, Deli Serdang", "mitraKontak": "0812-0000-1111", "mitraKebutuhan": "Pendampingan pemasaran hasil panen secara daring"}
b = req("POST", "/api/v1/dosen/proposals", dosen5, dict({"judul": "Pengabdian dengan detail mitra", "abstrak": abstrak, "jenis": "pengabdian"}, **MITRA))
expect("create pengabdian mitra", b, 201)
mp = b[1]["data"]
check("mitra detail saved", all(mp[k] == v for k, v in MITRA.items()) and mp["skema"] is None, mp)
b = expect("mitra detail clear", req("PATCH", f"/api/v1/dosen/proposals/{mp['id']}", dosen5, {"mitraKontak": None}), 200)
check("mitra kontak cleared", b["data"]["mitraKontak"] is None and b["data"]["mitraJenis"] == "Kelompok masyarakat", b["data"])
# komposisi tim pengabdian: minimal 2 dosen + 1 mahasiswa (selain ketua)
expect("pengabdian submit tanpa tim", req("POST", f"/api/v1/dosen/proposals/{mp['id']}/submit", dosen5), 400, "Proposal pengabdian belum dapat diajukan: tim wajib memiliki minimal 2 anggota dosen (sekarang 0) dan minimal 1 anggota mahasiswa (sekarang 0), selain ketua pengusul.")
lengkapi_tim(mp["id"], dosen5, "penelitian")
expect("pengabdian submit tanpa mahasiswa", req("POST", f"/api/v1/dosen/proposals/{mp['id']}/submit", dosen5), 400, "Proposal pengabdian belum dapat diajukan: tim wajib memiliki minimal 1 anggota mahasiswa (sekarang 0), selain ketua pengusul.")
lengkapi_tim(mp["id"], dosen5, "pengabdian")
b = expect("pengabdian submit tim lengkap", req("POST", f"/api/v1/dosen/proposals/{mp['id']}/submit", dosen5), 200, "Proposal berhasil diajukan")
check("pengabdian tim lengkap", len(b["data"]["anggota"]) == 3, b["data"]["anggota"])
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Penelitian tanpa mitra", "abstrak": abstrak, "jenis": "penelitian", "mitraJenis": None})
expect("penelitian mitra null ignored", b, 201)
pn = b[1]["data"]
check("penelitian mitra null", pn["mitraJenis"] is None, pn)
expect("penelitian mitra detail rejected", req("PATCH", f"/api/v1/dosen/proposals/{pn['id']}", dosen5, {"mitraAlamat": "x"}), 400, "Detail mitra hanya untuk proposal pengabdian")
expect("delete penelitian tanpa mitra", req("DELETE", f"/api/v1/dosen/proposals/{pn['id']}", dosen5), 200)
expect("approve pengabdian mitra", req("PATCH", f"/api/v1/proposals/{mp['id']}/status", ketua, {"status": "disetujui"}), 200)
b = expect("laporan copies mitra", req("POST", "/api/v1/laporan", dosen5, {"proposalId": mp["id"]}), 201)
check("laporan mitra detail", b["data"]["mitraJenis"] == "Kelompok masyarakat" and b["data"]["mitraAlamat"] == MITRA["mitraAlamat"] and b["data"]["mitraKebutuhan"] == MITRA["mitraKebutuhan"], b["data"])
expect("delete laporan mitra", req("DELETE", f"/api/v1/laporan/{b['data']['id']}", dosen5), 200)

# ── W-27, W-28 (laporan), W-30 (ketua mengatur peran reviewer) ──
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal untuk laporan W27", "abstrak": abstrak, "jenis": "penelitian", "kataKunci": ["awal"]})
expect("w27 proposal", b, 201)
wp = b[1]["data"]["id"]
expect("w27 approve", req("PATCH", f"/api/v1/proposals/{wp}/status", ketua, {"status": "disetujui"}), 200)
b = expect("w27 laporan", req("POST", "/api/v1/laporan", dosen5, {"proposalId": wp, "metodePenelitian": "Eksperimen"}), 201)
wl = b["data"]
check("laporan copies kata kunci + metode", wl["kataKunci"] == ["awal"] and wl["metodePenelitian"] == "Eksperimen", wl)
b = expect("w27 update kata kunci", req("PATCH", f"/api/v1/laporan/{wl['id']}", dosen5, {"kataKunci": ["hasil", " IoT ", "iot"], "metodePenelitian": "Studi kasus"}), 200, "Laporan berhasil diperbarui")
check("laporan kata kunci updated", b["data"]["kataKunci"] == ["hasil", "IoT"] and b["data"]["metodePenelitian"] == "Studi kasus", b["data"])
check("proposal kata kunci tetap", req("GET", f"/api/v1/dosen/proposals/{wp}", dosen5)[1]["data"]["kataKunci"] == ["awal"])
expect("w27 kata kunci invalid", req("PATCH", f"/api/v1/laporan/{wl['id']}", dosen5, {"kataKunci": "x"}), 422)
b = expect("w28 metode clear", req("PATCH", f"/api/v1/laporan/{wl['id']}", dosen5, {"metodePenelitian": None}), 200)
check("w28 metode null", b["data"]["metodePenelitian"] is None, b["data"])
expect("w27 delete laporan", req("DELETE", f"/api/v1/laporan/{wl['id']}", dosen5), 200)
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Pengabdian untuk laporan W28", "abstrak": abstrak, "jenis": "pengabdian"})
wpp = b[1]["data"]["id"]
expect("w28 approve pengabdian", req("PATCH", f"/api/v1/proposals/{wpp}/status", ketua, {"status": "disetujui"}), 200)
expect("w28 metode on pengabdian", req("POST", "/api/v1/laporan", dosen5, {"proposalId": wpp, "metodePenelitian": "x"}), 400, "Metode penelitian hanya untuk laporan penelitian")
b = expect("w28 metode null on pengabdian", req("POST", "/api/v1/laporan", dosen5, {"proposalId": wpp, "metodePenelitian": None}), 201)
check("w28 pengabdian metode null", b["data"]["metodePenelitian"] is None, b["data"])
expect("w28 delete laporan pengabdian", req("DELETE", f"/api/v1/laporan/{b['data']['id']}", dosen5), 200)
# W-30: dosen5 = dosen biasa
before = [r["role"]["name"] for r in req("GET", f"/api/v1/users/{dosen5User['id']}", admin)[1]["data"]["roles"]]
base = [r for r in before if r != "reviewer"]
b = expect("ketua add reviewer", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", ketua, {"roles": base + ["reviewer"]}), 200, "Roles assigned")
check("ketua added reviewer", "reviewer" in [r["role"]["name"] for r in b["data"]["roles"]], b["data"]["roles"])
expect("ketua add admin forbidden", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", ketua, {"roles": base + ["reviewer", "admin"]}), 403, "Ketua LPPM hanya dapat menambah atau mencabut peran reviewer pada dosen")
expect("ketua drop dosen forbidden", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", ketua, {"roles": ["reviewer"]}), 403)
expect("ketua on non-dosen forbidden", req("PATCH", f"/api/v1/users/{rev1User['id']}/roles", ketua, {"roles": ["reviewer"]}), 403)
b = expect("ketua remove reviewer", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", ketua, {"roles": base}), 200)
check("ketua removed reviewer", "reviewer" not in [r["role"]["name"] for r in b["data"]["roles"]], b["data"]["roles"])
expect("dosen roles forbidden", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", dosen1, {"roles": base}), 403, "Forbidden: insufficient permissions")
expect("restore dosen5 roles", req("PATCH", f"/api/v1/users/{dosen5User['id']}/roles", admin, {"roles": before}), 200)

# ── hak akses reviewer dosen (default tidak, diberi admin/ketua, cabut paksa ketua) ──
d5 = dosen5User["id"]
d5roles = [r["role"]["name"] for r in req("GET", f"/api/v1/users/{d5}", admin)[1]["data"]["roles"]]
check("dosen5 default bukan reviewer", "reviewer" not in d5roles, d5roles)
b = req("POST", "/api/v1/dosen/proposals", dosen2, {"judul": "Proposal untuk uji akses reviewer", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen})
ra = b[1]["data"]["id"]
lengkapi_tim(ra, dosen2, "penelitian")
expect("ra submit", req("POST", f"/api/v1/dosen/proposals/{ra}/submit", dosen2), 200)
expect("assign non-reviewer dosen", req("POST", f"/api/v1/proposals/{ra}/reviewers", ketua, {"reviewerIds": [d5]}), 400, "Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer")
expect("non-reviewer my-tugasan", req("GET", "/api/v1/reviewer/my-tugasan", dosen5), 403, "Anda tidak memiliki peran reviewer")
expect("non-reviewer laporan tugasan", req("GET", "/api/v1/laporan/tugasan", dosen5), 403, "Anda tidak memiliki peran reviewer")
b = expect("reviewer status", req("GET", f"/api/v1/users/{d5}/reviewer", ketua), 200, "Status reviewer fetched")
check("reviewer status shape", list(b["data"].keys()) == ["userId", "roles", "isReviewer", "bisaDijadikanReviewer", "tugasanBelumSelesai", "jumlahReviewSelesai"] and b["data"]["isReviewer"] is False and b["data"]["bisaDijadikanReviewer"] is True, b["data"])
expect("reviewer status by dosen", req("GET", f"/api/v1/users/{d5}/reviewer", dosen1), 403)
expect("grant to non-dosen", req("PATCH", f"/api/v1/users/{rev1User['id']}/reviewer", admin, {"isReviewer": True}), 400, "Peran reviewer hanya dapat diatur untuk user berperan dosen")
expect("grant invalid body", req("PATCH", f"/api/v1/users/{d5}/reviewer", admin, {"isReviewer": "ya"}), 422)
b = expect("admin grant reviewer", req("PATCH", f"/api/v1/users/{d5}/reviewer", admin, {"isReviewer": True}), 200, "Dosen dijadikan reviewer")
check("granted", b["data"]["isReviewer"] is True and "dosen" in b["data"]["roles"], b["data"])
check("me reflects reviewer", "reviewer" in req("GET", "/api/v1/auth/me", dosen5)[1]["data"]["roles"])
expect("grant again no change", req("PATCH", f"/api/v1/users/{d5}/reviewer", ketua, {"isReviewer": True}), 200, "Peran reviewer tidak berubah")
expect("assign new reviewer dosen", req("POST", f"/api/v1/proposals/{ra}/reviewers", ketua, {"reviewerIds": [d5]}), 200, "Reviewer ditugaskan")
b = expect("new reviewer my-tugasan (token lama)", req("GET", "/api/v1/reviewer/my-tugasan", dosen5), 200)
check("new reviewer sees tugasan", any(x["proposalId"] == ra for x in b["data"]), b["data"][:1])
expect("new reviewer saves draft review", req("POST", f"/api/v1/proposals/{ra}/reviews", dosen5, {"catatan": "draf"}), 200, "Review disimpan")
b = req("GET", f"/api/v1/users/{d5}/reviewer", ketua)[1]["data"]
t5 = [t for t in b["tugasanBelumSelesai"] if t["itemId"] == ra]
check("open tugasan listed", len(t5) == 1 and list(t5[0].keys()) == ["id", "itemId", "tipe", "createdAt", "judul", "status", "jenis", "pengusulId", "rekomendasi"] and t5[0]["status"] == "review", b["tugasanBelumSelesai"])
rk = t5[0]["rekomendasi"]
check("rekomendasi valid", rk is not None and rk["id"] not in (d5, dosen2User["id"]) and list(rk.keys()) == ["id", "name", "fullName", "tugasanBelumSelesai", "prioritas"], rk)
b = expect("kandidat reviewer", req("GET", f"/api/v1/users/kandidat-reviewer?itemId={ra}&exclude={d5}", ketua), 200, "Kandidat reviewer fetched")
kc = b["data"]
check("kandidat shape", len(kc) > 0 and list(kc[0].keys()) == ["id", "name", "fullName", "email", "programStudi", "tugasanBelumSelesai", "totalTugasan", "prioritas", "sudahDitugaskan"], kc[:1])
fresh = [x for x in kc if not x["sudahDitugaskan"]]
check("kandidat urut beban", [x["tugasanBelumSelesai"] for x in fresh] == sorted(x["tugasanBelumSelesai"] for x in fresh) and all(x["prioritas"] == (x["tugasanBelumSelesai"] == 0) for x in kc), [(x["id"], x["tugasanBelumSelesai"]) for x in kc])
check("kandidat tanpa pengusul & dosen dicabut", all(x["id"] not in (d5, dosen2User["id"]) for x in kc), [x["id"] for x in kc])
check("kandidat sudah ditugaskan di bawah", all(not x["sudahDitugaskan"] for x in kc[:len(fresh)]), [x["sudahDitugaskan"] for x in kc])
check("rekomendasi = kandidat beban terkecil", rk["tugasanBelumSelesai"] == fresh[0]["tugasanBelumSelesai"], (rk, fresh[:2]))
expect("kandidat bad itemId", req("GET", "/api/v1/users/kandidat-reviewer?itemId=abc", ketua), 400)
expect("kandidat missing item", req("GET", "/api/v1/users/kandidat-reviewer?itemId=999999", ketua), 404)
expect("kandidat forbidden", req("GET", "/api/v1/users/kandidat-reviewer", dosen1), 403)
expect("revoke blocked", req("PATCH", f"/api/v1/users/{d5}/reviewer", ketua, {"isReviewer": False}), 409)
expect("roles endpoint revoke blocked", req("PATCH", f"/api/v1/users/{d5}/roles", admin, {"roles": ["dosen"]}), 409)
expect("force revoke by admin forbidden", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", admin, {"pengalihan": []}), 403)
b = expect("force revoke without pengalihan", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {}), 400)
check("force revoke lists missing", "Belum dialihkan" in b["message"], b)
expect("force revoke to non-reviewer", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {"pengalihan": [{"tugasanId": t5[0]["id"], "reviewerBaruId": mhs1User["id"]}]}), 400, "Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer")
expect("force revoke to pengusul", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {"pengalihan": [{"tugasanId": t5[0]["id"], "reviewerBaruId": dosen2User["id"]}]}), 400)
expect("force revoke unknown tugasan", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {"pengalihan": [{"tugasanId": 999999, "reviewerBaruId": rev2User["id"]}]}), 400)
b = expect("force revoke", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {"pengalihan": [{"tugasanId": t5[0]["id"], "reviewerBaruId": rev2User["id"]}]}), 200, "Peran reviewer dicabut paksa")
check("force revoked", b["data"]["isReviewer"] is False and b["data"]["jumlahDialihkan"] >= 1 and b["data"]["tugasanBelumSelesai"] == [], b["data"])
check("rev2 got tugasan", any(x["proposalId"] == ra for x in req("GET", "/api/v1/reviewer/my-tugasan?limit=100", rev2)[1]["data"]))
check("rev2 notified", any(x["type"] == "reviewer_ditugaskan" and x["refId"] == ra for x in req("GET", "/api/v1/notifications?limit=50", rev2)[1]["data"]))
expect("revoked dosen my-tugasan", req("GET", "/api/v1/reviewer/my-tugasan", dosen5), 403, "Anda tidak memiliki peran reviewer")
expect("revoked dosen review", req("POST", f"/api/v1/proposals/{ra}/reviews", dosen5, {"catatan": "x"}), 403, "Anda tidak memiliki peran reviewer")
check("old draft review removed", all(r["reviewer"]["id"] != d5 for r in req("GET", f"/api/v1/proposals/{ra}/reviews", ketua)[1]["data"]))
b = expect("grant again then normal revoke", req("PATCH", f"/api/v1/users/{d5}/reviewer", ketua, {"isReviewer": True}), 200)
# cabut paksa otomatis: tugasan dialihkan ke reviewer rekomendasi (beban terkecil)
b = req("POST", "/api/v1/dosen/proposals", dosen2, {"judul": "Proposal kedua uji akses reviewer", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen})
ra2 = b[1]["data"]["id"]
lengkapi_tim(ra2, dosen2, "penelitian")
expect("ra2 submit", req("POST", f"/api/v1/dosen/proposals/{ra2}/submit", dosen2), 200)
expect("assign d5 ra2", req("POST", f"/api/v1/proposals/{ra2}/reviewers", ketua, {"reviewerIds": [d5]}), 200)
st = req("GET", f"/api/v1/users/{d5}/reviewer", ketua)[1]["data"]
t2 = [t for t in st["tugasanBelumSelesai"] if t["itemId"] == ra2][0]
b = expect("force revoke otomatis", req("POST", f"/api/v1/users/{d5}/reviewer/force-revoke", ketua, {"otomatis": True}), 200, "Peran reviewer dicabut paksa")
check("otomatis dialihkan", b["data"]["isReviewer"] is False and b["data"]["tugasanBelumSelesai"] == [], b["data"])
rv = [x["reviewerTugasan"] for x in [req("GET", f"/api/v1/proposals/{ra2}", ketua)[1]["data"]]][0]
check("otomatis ke reviewer rekomendasi", [x["reviewer"]["id"] for x in rv] == [t2["rekomendasi"]["id"]], (rv, t2["rekomendasi"]))
expect("grant d5 for normal revoke", req("PATCH", f"/api/v1/users/{d5}/reviewer", ketua, {"isReviewer": True}), 200)
expect("normal revoke without tugasan", req("PATCH", f"/api/v1/users/{d5}/reviewer", admin, {"isReviewer": False}), 200, "Peran reviewer dicabut")
expect("restore dosen5 roles after reviewer tests", req("PATCH", f"/api/v1/users/{d5}/roles", admin, {"roles": d5roles}), 200)

# ── mahasiswa tidak lagi mengusulkan proposal (tugasnya laporan harian) ──
FORB = "Forbidden: insufficient permissions"
expect("mhs create proposal (dosen api)", req("POST", "/api/v1/dosen/proposals", mhs2, {"judul": "Proposal Mahasiswa", "abstrak": abstrak, "jenis": "penelitian"}), 403, FORB)
expect("mhs create proposal (proposals api)", req("POST", "/api/v1/proposals", mhs2, {"judul": "Proposal Mahasiswa", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen}), 403, FORB)
expect("mhs list own proposals", req("GET", "/api/v1/dosen/proposals", mhs2), 403, FORB)
expect("mhs stats", req("GET", "/api/v1/dosen/proposals/stats", mhs2), 403, FORB)
expect("mhs member search", req("GET", "/api/v1/dosen/proposals/members/search?q=dosen", mhs2), 403, FORB)
expect("mhs update proposal", req("PATCH", f"/api/v1/proposals/{pid}", mhs1, {"judul": "Diubah mahasiswa"}), 403, FORB)
expect("mhs submit proposal", req("POST", f"/api/v1/dosen/proposals/{pid}/submit", mhs1), 403, FORB)
expect("mhs delete proposal", req("DELETE", f"/api/v1/proposals/{pid}", mhs1), 403, FORB)
expect("mhs laporan my", req("GET", "/api/v1/laporan/my", mhs1), 403, FORB)
expect("mhs laporan eligible", req("GET", "/api/v1/laporan/eligible", mhs1), 403, FORB)
expect("mhs luaran create", req("POST", "/api/v1/luaran", mhs1, {"proposalId": pid, "jenis": "jurnal", "target": "Jurnal"}), 403, FORB)
expect("mhs luaran stats", req("GET", "/api/v1/luaran/stats", mhs1), 403, FORB)
expect("mhs invitations tetap", req("GET", "/api/v1/dosen/proposals/invitations", mhs1), 200, "Invitations fetched")
expect("mhs as-member tetap", req("GET", "/api/v1/dosen/proposals/as-member", mhs1), 200)
expect("mhs laporan harian tetap", req("GET", "/api/v1/mahasiswa/laporan-harian/proposals", mhs1), 200)
expect("mhs baca proposal anggota tetap", req("GET", f"/api/v1/proposals/{pid}", mhs1), 200)

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
check("export row", row["anggaran"] == "15.000.000,5" and row["status"] == "Disetujui" and row["jenis"] == "Penelitian" and row["reviewer"] == "Dr. Reviewer 1, M.T" and row["anggota"] == "Mahasiswa 1 (anggota); Prof. Dosen 3, M.T (anggota); Dr. Dosen 4, M.Kom (anggota)" and row["jumlahReview"] == 1 and row["reviewSelesai"] == 1, row)
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

# ── backup database (admin): otomatis bulanan oleh sistem + manual oleh admin ──
import gzip, time
expect("backup list non-admin", req("GET", "/api/v1/backup", ketua), 403, "Forbidden: insufficient permissions")
expect("backup manual non-admin", req("POST", "/api/v1/backup", dosen5), 403)
b = expect("backup jadwal", req("GET", "/api/v1/backup/jadwal", admin), 200, "Jadwal backup fetched")
check("backup jadwal shape", list(b["data"].keys()) == ["otomatisAktif", "tanggal", "jam", "zonaWaktu", "keterangan", "berikutnyaAt", "sedangBerjalan", "terakhirOtomatis"], b["data"])
BK_KEYS = ["id", "sumber", "keterangan", "status", "periode", "namaFile", "ukuran", "jumlahTabel", "jumlahBaris", "pesanError", "mulaiAt", "selesaiAt", "durasiMs", "fileTersedia", "dihapusAt", "dibuatOleh", "dihapusOleh"]
if b["data"]["otomatisAktif"]:
    # server sudah melewati jadwal bulan ini → backup otomatis bulan ini dibuat saat start
    for _ in range(60):
        auto = req("GET", "/api/v1/backup?sumber=sistem&limit=1", admin)[1]["data"]
        if auto and auto[0]["status"] != "berjalan":
            break
        time.sleep(0.5)
    check("backup otomatis ada", auto and auto[0]["sumber"] == "sistem" and auto[0]["dibuatOleh"] is None and auto[0]["keterangan"] == "Otomatis oleh sistem (jadwal bulanan)" and auto[0]["periode"] is not None, auto[:1])
st, b, *_ = req("POST", "/api/v1/backup", admin)
check("backup manual 202", st == 202 and b["message"] == "Backup dimulai. Pantau statusnya lewat GET /backup/:id" and list(b["data"].keys()) == BK_KEYS, (st, b))
bk = b["data"]["id"]
check("backup manual oleh admin", b["data"]["sumber"] == "admin" and b["data"]["dibuatOleh"]["id"] == adminUser["id"] and b["data"]["keterangan"].startswith("Manual oleh admin "), b["data"])
for _ in range(120):
    b = req("GET", f"/api/v1/backup/{bk}", admin)[1]
    if b["data"]["status"] != "berjalan":
        break
    time.sleep(0.5)
check("backup manual berhasil", b["data"]["status"] == "berhasil" and b["data"]["fileTersedia"] and b["data"]["ukuran"] > 0 and b["data"]["jumlahTabel"] >= 20 and b["data"]["durasiMs"] is not None, b["data"])
b = expect("backup list", req("GET", "/api/v1/backup?sumber=admin&limit=5", admin), 200, "Log backup fetched")
check("backup list meta", b["meta"]["limit"] == 5 and b["data"][0]["id"] == bk and all(x["sumber"] == "admin" for x in b["data"]), b)
expect("backup list bad filter", req("GET", "/api/v1/backup?sumber=x", admin), 422)
st, _, hdrs, content = req("GET", f"/api/v1/backup/{bk}/download", admin)
sql = gzip.decompress(content).decode() if st == 200 else ""
check("backup download", st == 200 and hdrs["Content-Type"] == "application/gzip" and "attachment" in hdrs["Content-Disposition"] and "CREATE TABLE `User`" in sql and "VIEW `Proposal`" in sql and sql.rstrip().endswith("-- Selesai"), (st, dict(hdrs)))
expect("backup 404", req("GET", "/api/v1/backup/999999", admin), 404, "Log backup tidak ditemukan")
b = expect("backup delete", req("DELETE", f"/api/v1/backup/{bk}", admin), 200, "File backup berhasil dihapus")
check("backup deleted log kept", b["data"]["dihapusAt"] is not None and b["data"]["fileTersedia"] is False and b["data"]["dihapusOleh"]["id"] == adminUser["id"], b["data"])
expect("backup download deleted", req("GET", f"/api/v1/backup/{bk}/download", admin), 410, "File backup sudah dihapus")
expect("backup delete again", req("DELETE", f"/api/v1/backup/{bk}", admin), 409, "File backup sudah dihapus")
check("backup activity", any(x["action"] == "backup.manual" for x in req("GET", "/api/v1/activity-logs/my?limit=20", admin)[1]["data"]))

# ── template proposal (admin mengganti, dosen mengunduh tanpa token) ──
def up_template(token, fields, file):
    raw, ct = multipart(fields, file)
    return req("POST", "/api/v1/template-proposal", token, raw=raw, ctype=ct)
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TPL_KEYS = ["id", "jenis", "tahun", "keterangan", "namaFile", "mime", "ukuran", "isAktif", "unduhUrl", "diunggahOleh", "createdAt", "updatedAt"]
expect("template upload dosen forbidden", up_template(dosen1, {"jenis": "penelitian"}, ("file", "t.docx", DOCX_MIME, DOCX)), 403)
expect("template upload ketua forbidden", up_template(ketua, {"jenis": "penelitian"}, ("file", "t.docx", DOCX_MIME, DOCX)), 403)
expect("template upload no file", up_template(admin, {"jenis": "penelitian"}, None), 400, "File template tidak ditemukan dalam request (field `file`).")
expect("template upload bad type", up_template(admin, {}, ("file", "t.txt", "text/plain", b"halo")), 400, "Template harus berupa file DOCX atau PDF.")
expect("template upload fake docx", up_template(admin, {}, ("file", "t.docx", DOCX_MIME, b"bukan docx")), 400, "Isi file bukan DOCX atau PDF yang valid.")
b = expect("template upload bad jenis", up_template(admin, {"jenis": "x", "tahun": "1990"}, ("file", "t.docx", DOCX_MIME, DOCX)), 422)
check("template 422 fields", set(b["errors"].keys()) == {"jenis", "tahun"}, b)
b = expect("template upload", up_template(admin, {"jenis": "penelitian", "tahun": "2027", "keterangan": "Template penelitian 2027"}, ("file", "Template Penelitian 2027.docx", DOCX_MIME, DOCX)), 201, "Template proposal berhasil diunggah dan diaktifkan")
t1 = b["data"]
check("template shape", list(t1.keys()) == TPL_KEYS and t1["isAktif"] is True and t1["jenis"] == "penelitian" and t1["tahun"] == 2027 and t1["mime"] == DOCX_MIME and t1["diunggahOleh"]["id"] == adminUser["id"], t1)
b = expect("template aktif publik", req("GET", "/api/v1/template-proposal/aktif?jenis=penelitian"), 200, "Template aktif fetched")
check("template aktif id", b["data"]["id"] == t1["id"] and b["data"]["unduhUrl"] == f"/template-proposal/aktif/unduh?jenis=penelitian&v={t1['id']}", b["data"])
st, _, hdrs, content = req("GET", "/api/v1/template-proposal/aktif/unduh?jenis=penelitian")
check("template unduh publik", st == 200 and content == DOCX and hdrs["Content-Type"] == DOCX_MIME and "attachment" in hdrs["Content-Disposition"] and "Template%20Penelitian%202027.docx" in hdrs["Content-Disposition"], (st, dict(hdrs)))
b = expect("template upload v2", up_template(admin, {"jenis": "penelitian", "tahun": "2028"}, ("file", "template-2028.pdf", "application/pdf", PDF)), 201)
t2 = b["data"]
lst = expect("template list", req("GET", "/api/v1/template-proposal?jenis=penelitian", admin), 200, "Template fetched")["data"]
aktif = [x["id"] for x in lst if x["isAktif"]]
check("template satu aktif", aktif == [t2["id"]] and any(x["id"] == t1["id"] and not x["isAktif"] for x in lst), lst[:3])
expect("template list non-admin", req("GET", "/api/v1/template-proposal", dosen1), 403)
st, _, _, content = req("GET", f"/api/v1/template-proposal/{t1['id']}/unduh", admin)
check("template unduh versi lama", st == 200 and content == DOCX, st)
expect("template unduh versi lama non-admin", req("GET", f"/api/v1/template-proposal/{t1['id']}/unduh", dosen1), 403)
b = expect("template aktifkan lama", req("PATCH", f"/api/v1/template-proposal/{t1['id']}/aktifkan", admin), 200, "Template proposal diaktifkan")
check("template lama aktif", b["data"]["isAktif"] is True and req("GET", "/api/v1/template-proposal/aktif?jenis=penelitian")[1]["data"]["id"] == t1["id"], b["data"])
expect("template hapus aktif", req("DELETE", f"/api/v1/template-proposal/{t1['id']}", admin), 409, "Template yang sedang aktif tidak bisa dihapus. Unggah atau aktifkan template lain terlebih dahulu.")
expect("template hapus riwayat", req("DELETE", f"/api/v1/template-proposal/{t2['id']}", admin), 200, "Template proposal dihapus")
expect("template hapus missing", req("DELETE", f"/api/v1/template-proposal/{t2['id']}", admin), 404, "Template tidak ditemukan")
# jenis tanpa template aktif → jatuh ke template umum
b = expect("template umum", up_template(admin, {}, ("file", "umum.docx", DOCX_MIME, DOCX)), 201)
tu = b["data"]
peng = req("GET", "/api/v1/template-proposal/aktif?jenis=pengabdian")[1]["data"]
check("template fallback umum", tu["jenis"] == "umum" and peng is not None and (peng["jenis"] == "pengabdian" or peng["id"] == tu["id"]), peng)
expect("template aktif bad jenis", req("GET", "/api/v1/template-proposal/aktif?jenis=x"), 422)
check("template activity", any(x["action"] == "template.upload" for x in req("GET", "/api/v1/activity-logs/my?limit=30", admin)[1]["data"]))

# ── W-35 detail undangan (calon anggota yang belum menerima) ──
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal untuk uji detail undangan", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen, "rumpunIlmu": "Ilmu Teknik", "kataKunci": ["undangan"], "dokumenUrl": "https://drive.google.com/rahasia", "anggotaIds": [{"userId": dosen3User["id"], "peran": "anggota"}, {"userId": dosen4User["id"]}]})
up = b[1]["data"]["id"]
req("POST", "/api/v1/luaran", dosen5, {"proposalId": up, "jenis": "jurnal", "target": "Jurnal SINTA 4"})
inv3 = [i for i in req("GET", "/api/v1/dosen/proposals/invitations", dosen3)[1]["data"] if i["proposal"]["id"] == up][0]
b = expect("undangan detail", req("GET", f"/api/v1/dosen/proposals/invitations/{inv3['id']}", dosen3), 200, "Invitation fetched")
d = b["data"]
dp = d["proposal"]
check("undangan detail shape", list(d.keys()) == ["id", "peran", "statusUndangan", "createdAt", "proposal"] and d["statusUndangan"] == "pending" and dp["id"] == up and dp["abstrak"] == abstrak and dp["rumpunIlmu"] == "Ilmu Teknik" and dp["kataKunci"] == ["undangan"], d)
check("undangan detail tanpa data sensitif", "dokumenUrl" not in dp and "catatanRevisi" not in dp and "reviewerTugasan" not in dp and all("email" not in a["user"] and "noHp" not in a["user"] for a in dp["anggota"]) and len(dp["anggota"]) == 2 and dp["pengusul"]["id"] == dosen5User["id"], dp)
check("undangan detail target luaran", [x["target"] for x in dp["targetLuaran"]] == ["Jurnal SINTA 4"] and dp["tahapan"]["kode"] == "seleksi_usulan", dp.get("targetLuaran"))
expect("undangan detail orang lain", req("GET", f"/api/v1/dosen/proposals/invitations/{inv3['id']}", dosen4), 404, "Undangan tidak ditemukan")
expect("undangan detail missing", req("GET", "/api/v1/dosen/proposals/invitations/999999", dosen3), 404, "Undangan tidak ditemukan")
expect("undangan detail admin forbidden", req("GET", f"/api/v1/dosen/proposals/invitations/{inv3['id']}", admin), 403)
req("DELETE", f"/api/v1/dosen/proposals/{up}", dosen5)

# ── W-34 hapus proposal/laporan yang sudah diajukan: admin minta, Ketua setujui ──
b = req("POST", "/api/v1/dosen/proposals", dosen5, {"judul": "Proposal untuk uji hapus dengan izin", "abstrak": abstrak, "jenis": "penelitian", "periodeId": periodePen})
hp = b[1]["data"]["id"]
lengkapi_tim(hp, dosen5, "penelitian")
expect("hp submit", req("POST", f"/api/v1/dosen/proposals/{hp}/submit", dosen5), 200)
expect("hapus req ketua forbidden", req("POST", f"/api/v1/proposals/{hp}/deletion-request", ketua, {"password": "ketua123456", "alasan": "duplikat"}), 403)
expect("hapus req dosen forbidden", req("POST", f"/api/v1/proposals/{hp}/deletion-request", dosen5, {"password": "dosen123456", "alasan": "duplikat"}), 403)
expect("hapus req tanpa alasan", req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "admin123456"}), 422)
expect("hapus req tanpa password", req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"alasan": "Proposal duplikat"}), 400, "Password wajib diisi")
expect("hapus req password salah", req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "x", "alasan": "Proposal duplikat"}), 400, "Password salah")
expect("hapus req laporan route salah", req("POST", f"/api/v1/laporan/{hp}/deletion-request", admin, {"password": "admin123456", "alasan": "Proposal duplikat"}), 404, "Laporan tidak ditemukan")
b = expect("hapus req", req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "admin123456", "alasan": "Proposal duplikat"}), 201, "Permintaan penghapusan dikirim ke Ketua LPPM")
hr = b["data"]
check("hapus req shape", list(hr.keys()) == ["id", "tipe", "kegiatanId", "jenis", "judul", "status", "alasan", "catatan", "requester", "approver", "pengusul", "decidedAt", "createdAt", "updatedAt"] and hr["status"] == "pending" and hr["kegiatanId"] == hp and hr["pengusul"]["id"] == dosen5User["id"], hr)
expect("hapus req dobel", req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "admin123456", "alasan": "Proposal duplikat"}), 409)
b = expect("hapus pending", req("GET", f"/api/v1/proposals/{hp}/deletion-request", ketua), 200)
check("hapus pending id", b["data"]["id"] == hr["id"], b)
check("ketua notif hapus", any(x["type"] == "deletion_request" and x["refType"] == "DokumenDeletionRequest" and x["refId"] == hr["id"] for x in req("GET", "/api/v1/notifications", ketua)[1]["data"]))
b = expect("hapus list ketua", req("GET", "/api/v1/dokumen/deletion-request?status=pending", ketua), 200)
check("hapus list isi", any(x["id"] == hr["id"] for x in b["data"]), b["data"][:2])
expect("hapus approve admin forbidden", req("POST", f"/api/v1/dokumen/deletion-request/{hr['id']}/approve", admin, {"password": "admin123456"}), 403)
expect("hapus approve password salah", req("POST", f"/api/v1/dokumen/deletion-request/{hr['id']}/approve", ketua, {"password": "x"}), 400, "Password salah")
expect("hapus cancel orang lain", req("POST", f"/api/v1/dokumen/deletion-request/{hr['id']}/cancel", dosen5), 403)
b = expect("hapus tolak ketua", req("POST", f"/api/v1/dokumen/deletion-request/{hr['id']}/cancel", ketua, {"catatan": "Masih diperlukan"}), 200, "Permintaan penghapusan ditolak")
check("hapus ditolak", b["data"]["status"] == "rejected" and b["data"]["catatan"] == "Masih diperlukan", b["data"])
expect("hapus approve sudah diproses", req("POST", f"/api/v1/dokumen/deletion-request/{hr['id']}/approve", ketua, {"password": "ketua123456"}), 409, "Permintaan penghapusan sudah diproses")
check("admin notif ditolak", any(x["type"] == "deletion_cancelled" and x["refId"] == hr["id"] for x in req("GET", "/api/v1/notifications", admin)[1]["data"]))
# admin membatalkan sendiri
b = req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "admin123456", "alasan": "Coba lagi"})[1]
expect("hapus batal admin", req("POST", f"/api/v1/dokumen/deletion-request/{b['data']['id']}/cancel", admin), 200, "Permintaan penghapusan dibatalkan")
# proposal disetujui + laporan → hapus proposal ikut menghapus laporan
expect("hp approve status", req("PATCH", f"/api/v1/proposals/{hp}/status", ketua, {"status": "disetujui"}), 200)
hl = req("POST", "/api/v1/laporan", dosen5, {"proposalId": hp})[1]["data"]["id"]
b = expect("hapus req laporan", req("POST", f"/api/v1/laporan/{hl}/deletion-request", admin, {"password": "admin123456", "alasan": "Laporan salah unggah"}), 201)
lapReq = b["data"]["id"]
check("hapus req laporan tipe", b["data"]["tipe"] == "laporan", b["data"])
expect("hapus pending laporan", req("GET", f"/api/v1/laporan/{hl}/deletion-request", admin), 200, "Permintaan penghapusan fetched")
hr2 = req("POST", f"/api/v1/proposals/{hp}/deletion-request", admin, {"password": "admin123456", "alasan": "Proposal duplikat"})[1]["data"]
b = expect("hapus approve", req("POST", f"/api/v1/dokumen/deletion-request/{hr2['id']}/approve", ketua, {"password": "ketua123456"}), 200, "Proposal berhasil dihapus")
check("hapus approved", b["data"]["status"] == "approved" and b["data"]["kegiatanId"] is None and b["data"]["approver"]["name"] and b["data"]["judul"] == "Proposal untuk uji hapus dengan izin", b["data"])
expect("proposal terhapus", req("GET", f"/api/v1/proposals/{hp}", admin), 500, "Proposal tidak ditemukan")
expect("laporan ikut terhapus", req("GET", f"/api/v1/laporan/{hl}", admin), 404)
lr = [x for x in req("GET", "/api/v1/dokumen/deletion-request", ketua)[1]["data"] if x["id"] == lapReq][0]
check("permintaan laporan ikut selesai", lr["status"] == "approved" and lr["kegiatanId"] is None, lr)
check("pengusul notif dihapus", any(x["type"] == "deletion_approved" and x["refId"] == hr2["id"] for x in req("GET", "/api/v1/notifications", dosen5)[1]["data"]))
check("notif lama proposal dibersihkan", not any(x.get("refType") == "proposal" and x["refId"] == hp for x in req("GET", "/api/v1/notifications?limit=100", dosen5)[1]["data"]))

print(f"\n{CHECKS - len(FAILS)}/{CHECKS} checks passed")
sys.exit(1 if FAILS else 0)
