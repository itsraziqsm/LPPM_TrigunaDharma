package httpapi

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const (
	maxDocumentBytes  = 10 << 20
	maxMultipartBytes = maxDocumentBytes + 1<<20
)

func (s *Server) registerProposalRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/proposals", s.requireRoles(s.listProposals, "admin", "ketua_lppm", "reviewer"))
	mux.HandleFunc("GET /api/v1/proposals/my", s.requireAuth(s.myProposals))
	mux.HandleFunc("POST /api/v1/proposals", s.requireRoles(s.createProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/proposals/{id}", s.requireAuth(s.getProposal))
	mux.HandleFunc("PATCH /api/v1/proposals/{id}", s.requireRoles(s.updateProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("POST /api/v1/proposals/{id}/submit", s.requireRoles(s.submitProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("PATCH /api/v1/proposals/{id}/{subpath}", s.requireAuth(s.dispatchProposalPatch))
	mux.HandleFunc("DELETE /api/v1/proposals/{id}", s.requireRoles(s.deleteProposal, "dosen", "mahasiswa", "admin"))
	mux.HandleFunc("POST /api/v1/proposals/{id}/dokumen-utama", s.requireRoles(s.uploadProposalDocument, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/proposals/{id}/dokumen-utama", s.requireAuth(s.downloadProposalDocument))

	mux.HandleFunc("POST /api/v1/proposals/{proposalId}/reviewers", s.requireRoles(s.assignReviewers, "ketua_lppm", "admin"))
	mux.HandleFunc("DELETE /api/v1/proposals/{proposalId}/reviewers/{reviewerId}", s.requireRoles(s.removeReviewer, "ketua_lppm", "admin"))
	mux.HandleFunc("GET /api/v1/proposals/{proposalId}/reviews", s.requireRoles(s.getProposalReviews, "ketua_lppm", "admin", "reviewer"))
	mux.HandleFunc("POST /api/v1/proposals/{proposalId}/reviews", s.requireRoles(s.submitProposalReview, "reviewer"))
	mux.HandleFunc("POST /api/v1/proposals/{proposalId}/reviews/finalize", s.requireRoles(s.finalizeProposalReview, "reviewer"))
	mux.HandleFunc("GET /api/v1/reviewer/my-tugasan", s.requireRoles(s.myReviewerTasks, "reviewer", "dosen", "mahasiswa"))

	mux.HandleFunc("GET /api/v1/proposals/{proposalId}/laporan", s.requireAuth(s.listProposalReports))
	mux.HandleFunc("POST /api/v1/proposals/{proposalId}/laporan", s.requireRoles(s.createProposalReport, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/proposals/laporan/{id}/download", s.requireAuth(s.downloadProposalReport))
	// PATCH /{id}/{subpath} is dispatched above because the original Express
	// routes overlap for /laporan/status; the dispatcher applies each route's role policy.
	mux.HandleFunc("DELETE /api/v1/proposals/laporan/{id}", s.requireRoles(s.deleteProposalReport, "dosen", "mahasiswa", "admin"))
	mux.HandleFunc("GET /api/v1/proposals/{proposalId}/dokumen", s.requireAuth(s.listProposalDocuments))
	mux.HandleFunc("POST /api/v1/proposals/{proposalId}/dokumen", s.requireRoles(s.createProposalAttachment, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/proposals/dokumen/{id}/download", s.requireAuth(s.downloadProposalAttachment))
	mux.HandleFunc("DELETE /api/v1/proposals/dokumen/{id}", s.requireRoles(s.deleteProposalAttachment, "dosen", "mahasiswa", "admin"))

	mux.HandleFunc("GET /api/v1/dosen/proposals", s.requireRoles(s.myProposals, "dosen", "mahasiswa"))
	mux.HandleFunc("POST /api/v1/dosen/proposals", s.requireRoles(s.createProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/dosen/proposals/stats", s.requireRoles(s.proposerStats, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/dosen/proposals/members/search", s.requireRoles(s.searchProposalMembers, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/dosen/proposals/invitations", s.requireRoles(s.myInvitations, "dosen", "mahasiswa"))
	mux.HandleFunc("PATCH /api/v1/dosen/proposals/invitations/{id}", s.requireRoles(s.respondInvitation, "dosen", "mahasiswa"))
	mux.HandleFunc("GET /api/v1/dosen/proposals/{id}", s.requireRoles(s.getMyProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("PATCH /api/v1/dosen/proposals/{id}", s.requireRoles(s.updateProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("POST /api/v1/dosen/proposals/{id}/submit", s.requireRoles(s.submitProposal, "dosen", "mahasiswa"))
	mux.HandleFunc("DELETE /api/v1/dosen/proposals/{id}", s.requireRoles(s.deleteProposal, "dosen", "mahasiswa"))

	mux.HandleFunc("GET /api/v1/mahasiswa/laporan-harian/proposals", s.requireRoles(s.studentDailyProposals, "mahasiswa"))
	mux.HandleFunc("GET /api/v1/mahasiswa/laporan-harian/dokumen/{id}", s.requireRoles(s.downloadDailyReport, "mahasiswa"))
	mux.HandleFunc("GET /api/v1/mahasiswa/laporan-harian/{proposalId}", s.requireRoles(s.listDailyReports, "mahasiswa"))
	mux.HandleFunc("POST /api/v1/mahasiswa/laporan-harian/{proposalId}", s.requireRoles(s.createDailyReport, "mahasiswa"))
	mux.HandleFunc("DELETE /api/v1/mahasiswa/laporan-harian/{id}", s.requireRoles(s.deleteDailyReport, "mahasiswa"))
}

func (s *Server) dispatchProposalPatch(w http.ResponseWriter, r *http.Request) {
	id, subpath := r.PathValue("id"), r.PathValue("subpath")
	if id == "laporan" {
		if !userHasAnyRole(currentUser(r), "dosen", "mahasiswa", "admin") {
			sendError(w, "Forbidden: insufficient permissions", http.StatusForbidden)
			return
		}
		r.SetPathValue("id", subpath)
		s.updateProposalReport(w, r)
		return
	}
	if subpath == "status" {
		if !userHasAnyRole(currentUser(r), "ketua_lppm", "admin") {
			sendError(w, "Forbidden: insufficient permissions", http.StatusForbidden)
			return
		}
		s.updateProposalStatus(w, r)
		return
	}
	sendError(w, "Route "+r.URL.RequestURI()+" not found", http.StatusNotFound)
}

func userHasAnyRole(user *tokenPayload, roles ...string) bool {
	if user == nil {
		return false
	}
	return hasAnyRole(user.Roles, roles...)
}

func hasAnyRole(userRoles []string, roles ...string) bool {
	for _, userRole := range userRoles {
		for _, role := range roles {
			if userRole == role {
				return true
			}
		}
	}
	return false
}

type proposalInput struct {
	Judul      string   `json:"judul"`
	Abstrak    string   `json:"abstrak"`
	Jenis      string   `json:"jenis"`
	Anggaran   *float64 `json:"anggaran"`
	PeriodeID  *int64   `json:"periodeId"`
	DokumenURL *string  `json:"dokumenUrl"`
	AnggotaIDs []struct {
		UserID int64  `json:"userId"`
		Peran  string `json:"peran"`
	} `json:"anggotaIds"`
}

func (s *Server) listProposals(w http.ResponseWriter, r *http.Request) {
	s.proposalList(w, r, false)
}

func (s *Server) myProposals(w http.ResponseWriter, r *http.Request) {
	s.proposalList(w, r, true)
}

func (s *Server) proposalList(w http.ResponseWriter, r *http.Request, own bool) {
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		validationError(w, "page", "Expected a positive integer")
		return
	}
	limit, err := queryInt(r, "limit", 10, 1, 500)
	if err != nil {
		validationError(w, "limit", "Expected a positive integer")
		return
	}
	where, args := "1=1", []any{}
	if own {
		where += " AND p.pengusulId = ?"
		args = append(args, currentUser(r).UserID)
	}
	if kind := r.URL.Query().Get("jenis"); kind != "" {
		if kind != "penelitian" && kind != "pengabdian" {
			validationError(w, "jenis", "Invalid jenis")
			return
		}
		where += " AND p.jenis = ?"
		args = append(args, kind)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		if !validProposalStatus(status) {
			validationError(w, "status", "Invalid status")
			return
		}
		where += " AND p.status = ?"
		args = append(args, status)
	}
	if period := r.URL.Query().Get("periodeId"); period != "" {
		n, err := strconv.ParseInt(period, 10, 64)
		if err != nil {
			validationError(w, "periodeId", "Expected an integer")
			return
		}
		where += " AND p.periodeId = ?"
		args = append(args, n)
	}
	if year := r.URL.Query().Get("tahun"); year != "" {
		n, err := strconv.Atoi(year)
		if err != nil {
			validationError(w, "tahun", "Expected an integer")
			return
		}
		where += " AND pe.tahun = ?"
		args = append(args, n)
	}
	if study := r.URL.Query().Get("programStudi"); study != "" {
		where += " AND u.programStudi = ?"
		args = append(args, study)
	}
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		where += " AND (p.judul LIKE ? OR p.abstrak LIKE ?)"
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM Proposal p JOIN User u ON u.id=p.pengusulId LEFT JOIN Periode pe ON pe.id=p.periodeId WHERE "+where, args...).Scan(&total); err != nil {
		s.internalError(w, r, err)
		return
	}
	args = append(args, limit, (page-1)*limit)
	items, err := queryMaps(r, s.db, proposalBaseSelect+" WHERE "+where+" ORDER BY p.createdAt DESC LIMIT ? OFFSET ?", args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendJSON(w, http.StatusOK, responseEnvelope{Success: true, Message: func() string {
		if own {
			return "My proposals fetched"
		}
		return "Proposals fetched"
	}(), Data: items, Meta: map[string]int{"page": page, "limit": limit, "total": total}})
}

const proposalBaseSelect = `SELECT p.id,p.judul,p.abstrak,p.jenis,p.status,p.anggaran,p.catatanRevisi,p.dokumenUrl,p.dokumenNama,p.dokumenMime,p.dokumenUkuran,p.submittedAt,p.approvedAt,p.createdAt,p.updatedAt,
JSON_OBJECT('id',u.id,'name',u.name,'fullName',u.fullName,'email',u.email,'programStudi',u.programStudi,'nidn',u.nidn) AS pengusul,
IF(pe.id IS NULL,NULL,JSON_OBJECT('id',pe.id,'nama',pe.nama,'tahun',pe.tahun)) AS periode,
COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',a.id,'peran',a.peran,'statusUndangan',a.statusUndangan,'user',JSON_OBJECT('id',au.id,'name',au.name,'fullName',au.fullName,'email',au.email))) FROM ProposalAnggota a JOIN User au ON au.id=a.userId WHERE a.proposalId=p.id),JSON_ARRAY()) AS anggota,
COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',t.id,'reviewerId',t.reviewerId,'createdAt',t.createdAt,'reviewer',JSON_OBJECT('id',ru.id,'name',ru.name,'fullName',ru.fullName))) FROM ReviewerTugasan t JOIN User ru ON ru.id=t.reviewerId WHERE t.proposalId=p.id),JSON_ARRAY()) AS reviewerTugasan
FROM Proposal p JOIN User u ON u.id=p.pengusulId LEFT JOIN Periode pe ON pe.id=p.periodeId`

func (s *Server) getProposal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	item, err := s.proposalDetail(r, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.internalError(w, r, &requestError{message: "Proposal tidak ditemukan", status: 404})
		} else {
			s.internalError(w, r, err)
		}
		return
	}
	if !s.canAccessProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	sendSuccess(w, "Proposal fetched", item, http.StatusOK)
}

func (s *Server) getMyProposal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r).UserID
	var owner int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT pengusulId FROM Proposal WHERE id=?", id).Scan(&owner); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if owner != userID {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	item, err := s.proposalDetail(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Proposal fetched", item, http.StatusOK)
}

func (s *Server) proposalDetail(r *http.Request, id int64) (map[string]any, error) {
	item, err := queryOneMap(r, s.db, proposalBaseSelect+" WHERE p.id=?", id)
	if err != nil {
		return nil, err
	}
	item["reviews"], err = queryMaps(r, s.db, "SELECT rv.id,rv.nilaiRelevansi,rv.nilaiMetodologi,rv.nilaiAnggaran,rv.nilaiLuaran,rv.catatan,rv.rekomendasi,rv.isDone,rv.createdAt,JSON_OBJECT('id',u.id,'name',u.name) AS reviewer FROM ProposalReview rv JOIN User u ON u.id=rv.reviewerId WHERE rv.proposalId=?", id)
	if err != nil {
		return nil, err
	}
	item["laporan"], err = queryMaps(r, s.db, "SELECT id,proposalId,jenis,judul,dokumenUrl,dokumenNama,dokumenMime,dokumenUkuran,keterangan,createdAt,updatedAt FROM LaporanProposal WHERE proposalId=?", id)
	if err != nil {
		return nil, err
	}
	item["dokumenLampiran"], err = queryMaps(r, s.db, "SELECT id,proposalId,namaFile,fileUrl,ukuran,fileMime,fileNama,createdAt FROM DokumenLampiran WHERE proposalId=?", id)
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Server) canAccessProposal(r *http.Request, id int64) bool {
	user := currentUser(r)
	if contains(user.Roles, "admin") || contains(user.Roles, "ketua_lppm") {
		return true
	}
	var allowed bool
	err := s.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM Proposal p WHERE p.id=? AND (p.pengusulId=? OR EXISTS(SELECT 1 FROM ProposalAnggota a WHERE a.proposalId=p.id AND a.userId=? AND a.statusUndangan='diterima') OR EXISTS(SELECT 1 FROM ReviewerTugasan t WHERE t.proposalId=p.id AND t.reviewerId=?)))`, id, user.UserID, user.UserID, user.UserID).Scan(&allowed)
	return err == nil && allowed
}

func (s *Server) canWriteProposal(r *http.Request, id int64) bool {
	user := currentUser(r)
	if user == nil {
		return false
	}
	if contains(user.Roles, "admin") || contains(user.Roles, "ketua_lppm") {
		return true
	}
	var allowed bool
	err := s.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM Proposal p WHERE p.id=? AND (p.pengusulId=? OR EXISTS(SELECT 1 FROM ProposalAnggota a WHERE a.proposalId=p.id AND a.userId=? AND a.statusUndangan='diterima')))`, id, user.UserID, user.UserID).Scan(&allowed)
	return err == nil && allowed
}

func (s *Server) createProposal(w http.ResponseWriter, r *http.Request) {
	var body proposalInput
	if decodeJSON(w, r, &body) != nil || len(body.Judul) < 5 || len(body.Abstrak) < 20 || (body.Jenis != "penelitian" && body.Jenis != "pengabdian") {
		validationError(w, "body", "Invalid proposal data")
		return
	}
	userID := currentUser(r).UserID
	if !strings.HasPrefix(r.URL.Path, "/api/v1/dosen/") && body.PeriodeID == nil {
		validationError(w, "periodeId", "Periode harus dipilih")
		return
	}
	if body.PeriodeID != nil {
		var periodeJenis string
		if err := s.db.QueryRowContext(r.Context(), "SELECT jenis FROM Periode WHERE id = ?", *body.PeriodeID).Scan(&periodeJenis); err != nil {
			s.internalError(w, r, &requestError{message: "Periode tidak ditemukan", status: http.StatusBadRequest})
			return
		}
		if periodeJenis != body.Jenis {
			s.internalError(w, r, &requestError{message: fmt.Sprintf("Jenis proposal (%s) tidak sesuai dengan jenis periode (%s)", body.Jenis, periodeJenis), status: http.StatusBadRequest})
			return
		}
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	result, err := tx.ExecContext(r.Context(), "INSERT INTO Proposal (judul,abstrak,jenis,status,anggaran,pengusulId,periodeId,dokumenUrl,createdAt,updatedAt) VALUES (?,?,?,'draft',?,?,?,?,NOW(),NOW())", body.Judul, body.Abstrak, body.Jenis, body.Anggaran, userID, body.PeriodeID, body.DokumenURL)
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	for _, member := range body.AnggotaIDs {
		peran := member.Peran
		if peran == "" {
			peran = "anggota"
		}
		if _, err = tx.ExecContext(r.Context(), "INSERT INTO ProposalAnggota (proposalId,userId,peran,statusUndangan,createdAt) VALUES (?,?,?,'pending',NOW())", id, member.UserID, peran); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), userID, "proposal.create", "Proposal dibuat", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := s.proposalDetail(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Proposal created", item, http.StatusCreated)
}

func (s *Server) updateProposal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r).UserID
	var owner int64
	var status string
	err := s.db.QueryRowContext(r.Context(), "SELECT pengusulId,status FROM Proposal WHERE id=?", id).Scan(&owner, &status)
	if err != nil {
		s.userLookupError(w, r, err)
		return
	}
	isDosenModule := strings.HasPrefix(r.URL.Path, "/api/v1/dosen/")
	if isDosenModule && owner != userID || !isDosenModule && !s.canWriteProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	if status != "draft" && status != "revisi" {
		s.internalError(w, r, &requestError{message: "Proposal hanya bisa diedit saat status draft atau revisi", status: 400})
		return
	}
	var body map[string]any
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	allowed := map[string]bool{"judul": true, "abstrak": true, "anggaran": true, "periodeId": true, "dokumenUrl": true}
	sets, args := []string{}, []any{}
	for key, value := range body {
		if allowed[key] {
			sets = append(sets, "`"+key+"`=?")
			args = append(args, value)
		}
	}
	if members, exists := body["anggotaIds"]; exists {
		list, ok := members.([]any)
		if !ok {
			validationError(w, "anggotaIds", "Invalid member list")
			return
		}
		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
		if _, err = tx.ExecContext(r.Context(), "DELETE FROM ProposalAnggota WHERE proposalId=?", id); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
		for _, entry := range list {
			m, ok := entry.(map[string]any)
			if !ok {
				tx.Rollback()
				validationError(w, "anggotaIds", "Invalid member")
				return
			}
			memberID, ok := m["userId"].(float64)
			if !ok || memberID <= 0 {
				tx.Rollback()
				validationError(w, "anggotaIds", "Invalid member userId")
				return
			}
			peran, _ := m["peran"].(string)
			if peran == "" {
				peran = "anggota"
			}
			if _, err = tx.ExecContext(r.Context(), "INSERT INTO ProposalAnggota (proposalId,userId,peran,statusUndangan,createdAt) VALUES (?,?,?,'pending',NOW())", id, int64(memberID), peran); err != nil {
				tx.Rollback()
				s.internalError(w, r, err)
				return
			}
		}
		if err = tx.Commit(); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	if len(sets) > 0 {
		sets = append(sets, "updatedAt=NOW()")
		args = append(args, id)
		if _, err = s.db.ExecContext(r.Context(), "UPDATE Proposal SET "+strings.Join(sets, ",")+" WHERE id=?", args...); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	item, err := s.proposalDetail(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	message := "Proposal updated"
	if strings.HasPrefix(r.URL.Path, "/api/v1/dosen/") {
		message = "Proposal berhasil diperbarui"
	}
	sendSuccess(w, message, item, http.StatusOK)
}

func (s *Server) submitProposal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r).UserID
	var owner int64
	var status string
	if err := s.db.QueryRowContext(r.Context(), "SELECT pengusulId,status FROM Proposal WHERE id=?", id).Scan(&owner, &status); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	isDosenModule := strings.HasPrefix(r.URL.Path, "/api/v1/dosen/")
	if isDosenModule && owner != userID || !isDosenModule && !s.canWriteProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	if status != "draft" && status != "revisi" {
		s.internalError(w, r, &requestError{message: "Hanya proposal berstatus draft atau revisi yang bisa diajukan", status: 400})
		return
	}
	var pending, rejected int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COALESCE(SUM(statusUndangan='pending'),0),COALESCE(SUM(statusUndangan='ditolak'),0) FROM ProposalAnggota WHERE proposalId=?", id).Scan(&pending, &rejected); err != nil {
		s.internalError(w, r, err)
		return
	}
	if pending+rejected > 0 {
		s.internalError(w, r, &requestError{message: fmt.Sprintf("Proposal tidak dapat diajukan: %d anggota belum merespons undangan, %d anggota menolak undangan. Semua anggota harus menyetujui undangan terlebih dahulu.", pending, rejected), status: 400})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE Proposal SET status='diajukan',submittedAt=NOW(),updatedAt=NOW() WHERE id=?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), userID, "proposal.submit", "Proposal diajukan", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := s.proposalDetail(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	message := "Proposal diajukan"
	if strings.HasPrefix(r.URL.Path, "/api/v1/dosen/") {
		message = "Proposal berhasil diajukan"
	}
	sendSuccess(w, message, item, http.StatusOK)
}

func (s *Server) updateProposalStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Status  string  `json:"status"`
		Catatan *string `json:"catatanRevisi"`
	}
	if decodeJSON(w, r, &body) != nil || !validProposalStatus(body.Status) || body.Status == "draft" || body.Status == "diajukan" {
		validationError(w, "status", "Invalid proposal status")
		return
	}
	var owner int64
	var title string
	if err := s.db.QueryRowContext(r.Context(), "SELECT pengusulId,judul FROM Proposal WHERE id=?", id).Scan(&owner, &title); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE Proposal SET status=?,catatanRevisi=?,approvedAt=IF(?='disetujui',NOW(),approvedAt),updatedAt=NOW() WHERE id=?", body.Status, body.Catatan, body.Status, id); err != nil {
		s.internalError(w, r, err)
		return
	}
	notifyType := map[string]string{"disetujui": "proposal_disetujui", "ditolak": "proposal_ditolak", "revisi": "proposal_revisi", "review": "reviewer_ditugaskan"}[body.Status]
	if notifyType != "" {
		_, err := s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId,type,judul,pesan,refId,refType,isRead,createdAt) VALUES (?,?,?,?,?,'proposal',FALSE,NOW())", owner, notifyType, "Status Proposal Diperbarui", fmt.Sprintf("Status proposal %q berubah menjadi %s", title, body.Status), id)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "proposal.status", "Status proposal diperbarui", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := s.proposalDetail(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Status proposal diperbarui", item, http.StatusOK)
}

func (s *Server) deleteProposal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var owner int64
	var status string
	if err := s.db.QueryRowContext(r.Context(), "SELECT pengusulId,status FROM Proposal WHERE id=?", id).Scan(&owner, &status); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if !s.canWriteProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	if status != "draft" {
		s.internalError(w, r, &requestError{message: "Hanya proposal berstatus draft yang bisa dihapus", status: 400})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM Proposal WHERE id=?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	message := "Proposal deleted"
	if strings.HasPrefix(r.URL.Path, "/api/v1/dosen/") {
		message = "Proposal berhasil dihapus"
	}
	sendSuccess(w, message, nil, http.StatusOK)
}

func (s *Server) uploadProposalDocument(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	file, header, mimeType, err := readUpload(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !s.canEditProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	var title string
	_ = s.db.QueryRowContext(r.Context(), "SELECT judul FROM Proposal WHERE id=?", id).Scan(&title)
	_, err = s.db.ExecContext(r.Context(), "UPDATE Proposal SET dokumenBlob=?,dokumenNama=?,dokumenMime=?,dokumenUkuran=?,dokumenUrl=NULL,updatedAt=NOW() WHERE id=?", file, header.Filename, mimeType, len(file), id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "proposal.dokumen.upload", fmt.Sprintf("Dokumen %q diunggah untuk proposal %q", header.Filename, title), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := queryOneMap(r, s.db, "SELECT id,dokumenUrl,dokumenNama,dokumenMime,dokumenUkuran FROM Proposal WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Dokumen berhasil diunggah", item, http.StatusOK)
}

func (s *Server) downloadProposalDocument(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if !s.canAccessProposal(r, id) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	s.sendFile(w, r, "SELECT dokumenBlob,dokumenMime,dokumenNama,dokumenUkuran FROM Proposal WHERE id=?", id, "dokumen")
}

func (s *Server) canEditProposal(r *http.Request, id int64) bool {
	return s.canWriteProposal(r, id)
}

func (s *Server) sendFile(w http.ResponseWriter, r *http.Request, query string, args ...any) {
	var blob []byte
	var contentType, name string
	var size sql.NullInt64
	err := s.db.QueryRowContext(r.Context(), query, args...).Scan(&blob, &contentType, &name, &size)
	if err != nil || len(blob) == 0 {
		sendError(w, "Dokumen tidak ditemukan.", http.StatusNotFound)
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if name == "" {
		name = "document"
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", `inline; filename="`+url.PathEscape(name)+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(blob)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(blob)
}

func (s *Server) assignReviewers(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	var body struct {
		ReviewerIDs []int64 `json:"reviewerIds"`
	}
	if decodeJSON(w, r, &body) != nil || len(body.ReviewerIDs) < 1 {
		validationError(w, "reviewerIds", "Minimal 1 reviewer")
		return
	}
	var status, title string
	if err := s.db.QueryRowContext(r.Context(), "SELECT status,judul FROM Proposal WHERE id=?", pid).Scan(&status, &title); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if status != "diajukan" && status != "review" {
		s.internalError(w, r, errors.New("Proposal harus berstatus diajukan atau review untuk ditugaskan reviewer"))
		return
	}
	for _, rid := range body.ReviewerIDs {
		if _, err := s.db.ExecContext(r.Context(), "INSERT IGNORE INTO ReviewerTugasan (proposalId,reviewerId,createdAt) VALUES (?,?,NOW())", pid, rid); err != nil {
			s.internalError(w, r, err)
			return
		}
		_, err := s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId,type,judul,pesan,refId,refType,isRead,createdAt) VALUES (?,'reviewer_ditugaskan','Tugas Review Baru',?,?,'proposal',FALSE,NOW())", rid, fmt.Sprintf("Anda ditugaskan untuk mereview proposal %q", title), pid)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE Proposal SET status='review' WHERE id=?", pid); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "reviewer.tugaskan", "Reviewer ditugaskan ke proposal "+title, clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := queryOneMap(r, s.db, proposalBaseSelect+" WHERE p.id=?", pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Reviewer ditugaskan", item, http.StatusOK)
}

func (s *Server) removeReviewer(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	rid, err := strconv.ParseInt(r.PathValue("reviewerId"), 10, 64)
	if err != nil || rid < 1 {
		validationError(w, "reviewerId", "Expected a positive integer")
		return
	}
	if _, err = s.db.ExecContext(r.Context(), "DELETE FROM ReviewerTugasan WHERE proposalId=? AND reviewerId=?", pid, rid); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "reviewer.hapus_tugasan", "Reviewer task removed", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	sendSuccess(w, "Tugasan reviewer dihapus", nil, http.StatusOK)
}

func (s *Server) getProposalReviews(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	items, err := queryMaps(r, s.db, "SELECT rv.*,JSON_OBJECT('id',u.id,'name',u.name,'fullName',u.fullName) AS reviewer FROM ProposalReview rv JOIN User u ON u.id=rv.reviewerId WHERE rv.proposalId=?", pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Reviews fetched", items, http.StatusOK)
}

func (s *Server) submitProposalReview(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	var assigned int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM ReviewerTugasan WHERE proposalId=? AND reviewerId=?", pid, uid).Scan(&assigned); err != nil {
		s.internalError(w, r, err)
		return
	}
	if assigned == 0 {
		s.internalError(w, r, errors.New("Anda tidak ditugaskan untuk mereview proposal ini"))
		return
	}
	var body map[string]any
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	fields := []string{"nilaiRelevansi", "nilaiMetodologi", "nilaiAnggaran", "nilaiLuaran", "catatan", "rekomendasi"}
	values := make([]any, len(fields))
	assignments := make([]string, len(fields))
	for i, key := range fields {
		values[i] = body[key]
		assignments[i] = "`" + key + "`=VALUES(`" + key + "`)"
	}
	if body["rekomendasi"] != nil && !validReviewRecommendation(fmt.Sprint(body["rekomendasi"])) {
		validationError(w, "rekomendasi", "Invalid recommendation")
		return
	}
	args := []any{pid, uid}
	args = append(args, values...)
	query := "INSERT INTO ProposalReview (proposalId,reviewerId,nilaiRelevansi,nilaiMetodologi,nilaiAnggaran,nilaiLuaran,catatan,rekomendasi,isDone,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?, ?,FALSE,NOW(),NOW()) ON DUPLICATE KEY UPDATE " + strings.Join(append(assignments, "isDone=FALSE", "updatedAt=NOW()"), ",")
	if _, err := s.db.ExecContext(r.Context(), query, args...); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), uid, "review.submit", fmt.Sprintf("Review disimpan untuk proposal #%d", pid), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := queryOneMap(r, s.db, "SELECT * FROM ProposalReview WHERE proposalId=? AND reviewerId=?", pid, uid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Review disimpan", item, http.StatusOK)
}

func (s *Server) finalizeProposalReview(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	result, err := s.db.ExecContext(r.Context(), "UPDATE ProposalReview SET isDone=TRUE,updatedAt=NOW() WHERE proposalId=? AND reviewerId=?", pid, uid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		s.internalError(w, r, &requestError{message: "Review not found", status: 404})
		return
	}
	var owner int64
	var title string
	if err := s.db.QueryRowContext(r.Context(), "SELECT p.pengusulId,p.judul FROM Proposal p WHERE p.id=?", pid).Scan(&owner, &title); err != nil {
		s.internalError(w, r, err)
		return
	}
	_, err = s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId,type,judul,pesan,refId,refType,isRead,createdAt) VALUES (?,'review_selesai','Review Selesai',?,?,'proposal',FALSE,NOW())", owner, fmt.Sprintf("Proposal %q telah selesai direview", title), pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), uid, "review.finalize", "Review finalized", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	item, err := queryOneMap(r, s.db, "SELECT * FROM ProposalReview WHERE proposalId=? AND reviewerId=?", pid, uid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Review diselesaikan", item, http.StatusOK)
}

func (s *Server) myReviewerTasks(w http.ResponseWriter, r *http.Request) {
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		validationError(w, "page", "Expected positive integer")
		return
	}
	limit, err := queryInt(r, "limit", 10, 1, 1000)
	if err != nil {
		validationError(w, "limit", "Expected positive integer")
		return
	}
	uid := currentUser(r).UserID
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM ReviewerTugasan WHERE reviewerId=?", uid).Scan(&total); err != nil {
		s.internalError(w, r, err)
		return
	}
	items, err := queryMaps(r, s.db, "SELECT t.id,t.proposalId,t.reviewerId,t.createdAt,JSON_OBJECT('id',p.id,'judul',p.judul,'status',p.status,'jenis',p.jenis,'pengusul',JSON_OBJECT('id',u.id,'name',u.name)) AS proposal FROM ReviewerTugasan t JOIN Proposal p ON p.id=t.proposalId JOIN User u ON u.id=p.pengusulId WHERE t.reviewerId=? ORDER BY t.createdAt DESC LIMIT ? OFFSET ?", uid, limit, (page-1)*limit)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	for _, item := range items {
		review, err := queryOneMap(r, s.db, "SELECT id,proposalId,nilaiRelevansi,nilaiMetodologi,nilaiAnggaran,nilaiLuaran,catatan,rekomendasi,isDone FROM ProposalReview WHERE proposalId=? AND reviewerId=?", item["proposalId"], uid)
		if errors.Is(err, sql.ErrNoRows) {
			item["myReview"] = nil
		} else if err != nil {
			s.internalError(w, r, err)
			return
		} else {
			item["myReview"] = review
		}
	}
	sendJSON(w, http.StatusOK, responseEnvelope{Success: true, Message: "Tugasan review fetched", Data: items, Meta: map[string]int{"page": page, "limit": limit, "total": total}})
}

func (s *Server) proposerStats(w http.ResponseWriter, r *http.Request) {
	uid := currentUser(r).UserID
	var total, draft, submitted, approved, revision, rejected int
	err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*),COALESCE(SUM(status='draft'),0),COALESCE(SUM(status='diajukan'),0),COALESCE(SUM(status='disetujui'),0),COALESCE(SUM(status='revisi'),0),COALESCE(SUM(status='ditolak'),0) FROM Proposal WHERE pengusulId=?", uid).
		Scan(&total, &draft, &submitted, &approved, &revision, &rejected)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Stats fetched", map[string]int{"total": total, "draft": draft, "diajukan": submitted, "disetujui": approved, "revisi": revision, "ditolak": rejected}, http.StatusOK)
}

func (s *Server) searchProposalMembers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		sendError(w, "Ketik minimal 2 karakter untuk mencari pengguna", http.StatusBadRequest)
		return
	}
	items, err := queryMaps(r, s.db, "SELECT u.id,u.name,u.fullName,u.email,u.programStudi,u.prodi,u.nim,u.nidn FROM User u WHERE u.status='approved' AND u.id<>? AND EXISTS(SELECT 1 FROM UserRole ur JOIN Role rl ON rl.id=ur.roleId WHERE ur.userId=u.id AND rl.name IN ('dosen','mahasiswa')) AND (u.name LIKE ? OR u.fullName LIKE ? OR u.email LIKE ? OR u.nim LIKE ? OR u.nidn LIKE ?) ORDER BY u.name LIMIT 50", currentUser(r).UserID, "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Users fetched", items, http.StatusOK)
}

func (s *Server) myInvitations(w http.ResponseWriter, r *http.Request) {
	items, err := queryMaps(r, s.db, "SELECT a.id,a.peran,a.statusUndangan,a.createdAt,JSON_OBJECT('id',p.id,'judul',p.judul,'jenis',p.jenis,'status',p.status,'anggaran',p.anggaran,'pengusul',JSON_OBJECT('id',u.id,'name',u.name,'fullName',u.fullName,'email',u.email),'periode',IF(pe.id IS NULL,NULL,JSON_OBJECT('id',pe.id,'nama',pe.nama,'tahun',pe.tahun))) AS proposal FROM ProposalAnggota a JOIN Proposal p ON p.id=a.proposalId JOIN User u ON u.id=p.pengusulId LEFT JOIN Periode pe ON pe.id=p.periodeId WHERE a.userId=? ORDER BY a.createdAt DESC", currentUser(r).UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Invitations fetched", items, http.StatusOK)
}

func (s *Server) respondInvitation(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if decodeJSON(w, r, &body) != nil || (body.Status != "diterima" && body.Status != "ditolak") {
		sendJSON(w, http.StatusBadRequest, map[string]string{"message": "Status harus diterima atau ditolak"})
		return
	}
	result, err := s.db.ExecContext(r.Context(), "UPDATE ProposalAnggota SET statusUndangan=? WHERE id=? AND userId=? AND statusUndangan='pending'", body.Status, id, currentUser(r).UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		var owner int64
		var proposalID int64
		var title, status string
		lookupErr := s.db.QueryRowContext(r.Context(), "SELECT a.userId,a.proposalId,a.statusUndangan,p.judul FROM ProposalAnggota a JOIN Proposal p ON p.id=a.proposalId WHERE a.id=?", id).Scan(&owner, &proposalID, &status, &title)
		if lookupErr != nil {
			s.internalError(w, r, &requestError{message: "Undangan tidak ditemukan", status: 404})
		} else if owner != currentUser(r).UserID {
			s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke undangan ini", status: 403})
		} else {
			s.internalError(w, r, &requestError{message: "Undangan sudah direspon sebelumnya", status: 400})
		}
		return
	}
	var proposalID int64
	var title string
	if err := s.db.QueryRowContext(r.Context(), "SELECT a.proposalId,p.judul FROM ProposalAnggota a JOIN Proposal p ON p.id=a.proposalId WHERE a.id=?", id).Scan(&proposalID, &title); err == nil {
		_ = s.logActivity(r.Context(), currentUser(r).UserID, "proposal.anggota."+body.Status, fmt.Sprintf("Undangan anggota proposal %q %s", title, body.Status), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	}
	item, err := queryOneMap(r, s.db, "SELECT * FROM ProposalAnggota WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Undangan berhasil "+body.Status, item, http.StatusOK)
}

func (s *Server) studentDailyProposals(w http.ResponseWriter, r *http.Request) {
	items, err := queryMaps(r, s.db, "SELECT a.id AS anggotaId,a.peran,p.id,p.judul,p.jenis,p.status,JSON_OBJECT('id',u.id,'name',u.name,'fullName',u.fullName) AS pengusul,IF(pe.id IS NULL,NULL,JSON_OBJECT('id',pe.id,'nama',pe.nama,'tahun',pe.tahun)) AS periode FROM ProposalAnggota a JOIN Proposal p ON p.id=a.proposalId JOIN User u ON u.id=p.pengusulId LEFT JOIN Periode pe ON pe.id=p.periodeId WHERE a.userId=? AND a.statusUndangan='diterima' ORDER BY a.createdAt DESC", currentUser(r).UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Proposals fetched", items, http.StatusOK)
}

func (s *Server) listDailyReports(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	if !s.acceptedMember(r, pid, uid) {
		s.internalError(w, r, &requestError{message: "Anda bukan anggota proposal ini", status: 403})
		return
	}
	items, err := queryMaps(r, s.db, "SELECT id,tanggal,kegiatan,dokumenNama,dokumenMime,dokumenUkuran,linkGdrive,createdAt,updatedAt FROM LaporanHarian WHERE proposalId=? AND userId=? ORDER BY tanggal DESC", pid, uid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan harian fetched", items, http.StatusOK)
}

func (s *Server) createDailyReport(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	if !s.acceptedMember(r, pid, uid) {
		s.internalError(w, r, &requestError{message: "Anda bukan anggota proposal ini", status: 403})
		return
	}
	var tanggal, kegiatan, link string
	var blob []byte
	var filename, mimeType string
	var size int64
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		file, header, detected, err := readUpload(w, r)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
		blob, filename, mimeType, size = file, header.Filename, detected, int64(len(file))
		tanggal = r.FormValue("tanggal")
		kegiatan = r.FormValue("kegiatan")
		link = r.FormValue("linkGdrive")
	} else {
		var body struct {
			Tanggal  string `json:"tanggal"`
			Kegiatan string `json:"kegiatan"`
			Link     string `json:"linkGdrive"`
		}
		if decodeJSON(w, r, &body) != nil {
			sendError(w, "Tanggal dan kegiatan wajib diisi", 400)
			return
		}
		tanggal, kegiatan, link = body.Tanggal, body.Kegiatan, body.Link
	}
	date, err := parseDate(tanggal)
	if err != nil || strings.TrimSpace(kegiatan) == "" {
		sendError(w, "Tanggal dan kegiatan wajib diisi", 400)
		return
	}
	var result sql.Result
	result, err = s.db.ExecContext(r.Context(), "INSERT INTO LaporanHarian (proposalId,userId,tanggal,kegiatan,dokumenNama,dokumenMime,dokumenUkuran,dokumenBlob,linkGdrive,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())", pid, uid, date, kegiatan, nullIfEmpty(filename), nullIfEmpty(mimeType), nullableInt(size), nullIfEmptyBytes(blob), nullIfEmpty(link))
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	id, _ := result.LastInsertId()
	item, err := queryOneMap(r, s.db, "SELECT id,tanggal,kegiatan,dokumenNama,dokumenMime,dokumenUkuran,linkGdrive,createdAt FROM LaporanHarian WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan harian berhasil dibuat", item, http.StatusCreated)
}

func (s *Server) downloadDailyReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	var owner int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT userId FROM LaporanHarian WHERE id=?", id).Scan(&owner); err != nil {
		s.internalError(w, r, &requestError{message: "Laporan tidak ditemukan", status: 404})
		return
	}
	if owner != uid {
		s.internalError(w, r, &requestError{message: "Akses ditolak", status: 403})
		return
	}
	s.sendFile(w, r, "SELECT dokumenBlob,dokumenMime,dokumenNama,dokumenUkuran FROM LaporanHarian WHERE id=?", id, "laporan-harian")
}

func (s *Server) deleteDailyReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	uid := currentUser(r).UserID
	var owner int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT userId FROM LaporanHarian WHERE id=?", id).Scan(&owner); err != nil {
		s.internalError(w, r, &requestError{message: "Laporan tidak ditemukan", status: 404})
		return
	}
	if owner != uid {
		s.internalError(w, r, &requestError{message: "Akses ditolak", status: 403})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM LaporanHarian WHERE id=?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan harian berhasil dihapus", nil, http.StatusOK)
}

func (s *Server) acceptedMember(r *http.Request, pid, uid int64) bool {
	var count int
	_ = s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM ProposalAnggota WHERE proposalId=? AND userId=? AND statusUndangan='diterima'", pid, uid).Scan(&count)
	return count > 0
}

func (s *Server) listProposalReports(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	if !s.canAccessProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	items, err := queryMaps(r, s.db, "SELECT id,proposalId,jenis,judul,dokumenUrl,dokumenNama,dokumenMime,dokumenUkuran,keterangan,createdAt,updatedAt FROM LaporanProposal WHERE proposalId=? ORDER BY createdAt DESC", pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan fetched", items, http.StatusOK)
}

func (s *Server) createProposalReport(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	if !s.canEditProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	var proposalStatus string
	var ownerID int64
	var proposalTitle string
	if err := s.db.QueryRowContext(r.Context(), "SELECT status,pengusulId,judul FROM Proposal WHERE id=?", pid).Scan(&proposalStatus, &ownerID, &proposalTitle); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if proposalStatus != "disetujui" {
		s.internalError(w, r, errors.New("Laporan hanya bisa diunggah untuk proposal yang sudah disetujui"))
		return
	}
	body, file, header, mimeType, err := readOptionalUploadBody(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	kind, _ := body["jenis"].(string)
	title, _ := body["judul"].(string)
	urlValue, _ := body["dokumenUrl"].(string)
	note, _ := body["keterangan"].(string)
	fileName := ""
	if header != nil {
		fileName = header.Filename
	}
	if (kind != "kemajuan" && kind != "akhir") || len(title) < 3 {
		validationError(w, "body", "Invalid report data")
		return
	}
	if len(file) == 0 && urlValue == "" {
		s.internalError(w, r, errors.New("File atau URL dokumen wajib diisi."))
		return
	}
	if len(file) > 0 {
		urlValue = ""
	}
	result, err := s.db.ExecContext(r.Context(), "INSERT INTO LaporanProposal (proposalId,jenis,judul,dokumenUrl,dokumenBlob,dokumenNama,dokumenMime,dokumenUkuran,keterangan,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())", pid, kind, title, nullIfEmpty(urlValue), nullIfEmptyBytes(file), nullIfEmpty(fileName), nullIfEmpty(mimeType), nullableInt(int64(len(file))), nullIfEmpty(note))
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_, err = s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId,type,judul,pesan,refId,refType,isRead,createdAt) VALUES (?,'laporan_diunggah','Laporan Diunggah',?,?,'proposal',FALSE,NOW())", ownerID, fmt.Sprintf("Laporan %s untuk %q telah diunggah", kind, proposalTitle), pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "laporan.upload", "Laporan "+kind+" diunggah", clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	id, _ := result.LastInsertId()
	item, err := queryOneMap(r, s.db, "SELECT id,proposalId,jenis,judul,dokumenUrl,dokumenNama,dokumenMime,dokumenUkuran,keterangan,createdAt,updatedAt FROM LaporanProposal WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan diunggah", item, http.StatusCreated)
}

func (s *Server) downloadProposalReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var pid int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT proposalId FROM LaporanProposal WHERE id=?", id).Scan(&pid); err != nil {
		s.internalError(w, r, &requestError{message: "File laporan tidak ditemukan.", status: 404})
		return
	}
	if !s.canAccessProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	s.sendFile(w, r, "SELECT dokumenBlob,dokumenMime,dokumenNama,dokumenUkuran FROM LaporanProposal WHERE id=?", id, "laporan")
}

func (s *Server) updateProposalReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	body := map[string]any{}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	var pid int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT proposalId FROM LaporanProposal WHERE id=?", id).Scan(&pid); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if !s.canWriteProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	sets, args := []string{}, []any{}
	for _, key := range []string{"jenis", "judul", "dokumenUrl", "keterangan"} {
		if val, ok := body[key]; ok {
			sets = append(sets, "`"+key+"`=?")
			args = append(args, val)
		}
	}
	if len(sets) > 0 {
		sets = append(sets, "updatedAt=NOW()")
		args = append(args, id)
		if _, err := s.db.ExecContext(r.Context(), "UPDATE LaporanProposal SET "+strings.Join(sets, ",")+" WHERE id=?", args...); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	item, err := queryOneMap(r, s.db, "SELECT id,proposalId,jenis,judul,dokumenUrl,dokumenNama,dokumenMime,dokumenUkuran,keterangan,createdAt,updatedAt FROM LaporanProposal WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan updated", item, http.StatusOK)
}

func (s *Server) deleteProposalReport(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var pid int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT proposalId FROM LaporanProposal WHERE id=?", id).Scan(&pid); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if !s.canWriteProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM LaporanProposal WHERE id=?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Laporan deleted", nil, http.StatusOK)
}

func (s *Server) listProposalDocuments(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	if !s.canAccessProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	items, err := queryMaps(r, s.db, "SELECT id,proposalId,namaFile,fileUrl,ukuran,fileMime,fileNama,createdAt FROM DokumenLampiran WHERE proposalId=? ORDER BY createdAt DESC", pid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Dokumen fetched", items, http.StatusOK)
}

func (s *Server) createProposalAttachment(w http.ResponseWriter, r *http.Request) {
	pid, ok := proposalPathID(w, r)
	if !ok {
		return
	}
	if !s.canEditProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	body, file, header, mimeType, err := readOptionalUploadBody(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	name, _ := body["namaFile"].(string)
	if name == "" && header != nil {
		name = header.Filename
	}
	if name == "" {
		validationError(w, "namaFile", "Nama file wajib diisi")
		return
	}
	fileURL, _ := body["fileUrl"].(string)
	if len(file) == 0 && fileURL == "" {
		validationError(w, "file", "File atau URL dokumen wajib diisi.")
		return
	}
	size := int64(len(file))
	if parsed, ok := body["ukuran"].(float64); ok {
		size = int64(parsed)
	}
	fileName := ""
	if header != nil {
		fileName = header.Filename
	}
	result, err := s.db.ExecContext(r.Context(), "INSERT INTO DokumenLampiran (proposalId,namaFile,fileUrl,ukuran,fileBlob,fileMime,fileNama,createdAt) VALUES (?,?,?,?,?,?,?,NOW())", pid, name, nullIfEmpty(fileURL), nullableInt(size), nullIfEmptyBytes(file), nullIfEmpty(mimeType), nullIfEmpty(fileName))
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), currentUser(r).UserID, "dokumen.upload", fmt.Sprintf("Dokumen %q diunggah", name), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	id, _ := result.LastInsertId()
	item, err := queryOneMap(r, s.db, "SELECT id,proposalId,namaFile,fileUrl,ukuran,fileMime,fileNama,createdAt FROM DokumenLampiran WHERE id=?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Dokumen uploaded", item, http.StatusCreated)
}

func (s *Server) downloadProposalAttachment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var pid int64
	if err := s.db.QueryRowContext(r.Context(), "SELECT proposalId FROM DokumenLampiran WHERE id=?", id).Scan(&pid); err != nil {
		s.internalError(w, r, &requestError{message: "File dokumen tidak ditemukan.", status: 404})
		return
	}
	if !s.canAccessProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	s.sendFile(w, r, "SELECT fileBlob,fileMime,fileNama,ukuran FROM DokumenLampiran WHERE id=?", id, "dokumen")
}

func (s *Server) deleteProposalAttachment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var pid int64
	var filename string
	if err := s.db.QueryRowContext(r.Context(), "SELECT proposalId,namaFile FROM DokumenLampiran WHERE id=?", id).Scan(&pid, &filename); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	user := currentUser(r)
	if !s.canWriteProposal(r, pid) {
		s.internalError(w, r, &requestError{message: "Anda tidak memiliki akses ke proposal ini", status: 403})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM DokumenLampiran WHERE id=?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	_ = s.logActivity(r.Context(), user.UserID, "dokumen.delete", fmt.Sprintf("Dokumen %q dihapus", filename), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
	sendSuccess(w, "Dokumen deleted", nil, http.StatusOK)
}

func proposalPathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("proposalId"), 10, 64)
	if err != nil || id <= 0 {
		validationError(w, "proposalId", "Expected a positive integer")
		return 0, false
	}
	return id, true
}

func validProposalStatus(value string) bool {
	return value == "draft" || value == "diajukan" || value == "review" || value == "revisi" || value == "disetujui" || value == "ditolak"
}
func validReviewRecommendation(value string) bool {
	return value == "disetujui" || value == "revisi" || value == "ditolak"
}

func readUpload(w http.ResponseWriter, r *http.Request) ([]byte, *multipart.FileHeader, string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxMultipartBytes)
	if err := r.ParseMultipartForm(maxMultipartBytes); err != nil {
		return nil, nil, "", &requestError{message: "File tidak ditemukan dalam request.", status: 400}
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, nil, "", &requestError{message: "File tidak ditemukan dalam request.", status: 400}
	}
	defer file.Close()
	if header.Size > maxDocumentBytes {
		return nil, nil, "", &requestError{message: "Ukuran file maksimal 10 MB.", status: 400}
	}
	data, err := io.ReadAll(io.LimitReader(file, maxDocumentBytes+1))
	if err != nil {
		return nil, nil, "", err
	}
	if len(data) > maxDocumentBytes {
		return nil, nil, "", &requestError{message: "Ukuran file maksimal 10 MB.", status: 400}
	}
	detected, err := detectDocumentMime(data)
	if err != nil {
		return nil, nil, "", &requestError{message: "Hanya file PDF atau DOCX yang diizinkan.", status: 400}
	}
	if header.Header.Get("Content-Type") != "" && header.Header.Get("Content-Type") != "application/octet-stream" && header.Header.Get("Content-Type") != detected {
		return nil, nil, "", &requestError{message: "Hanya file PDF atau DOCX yang diizinkan.", status: 400}
	}
	return data, header, detected, nil
}

func detectDocumentMime(data []byte) (string, error) {
	if bytes.HasPrefix(data, []byte("%PDF-")) {
		return "application/pdf", nil
	}
	if len(data) >= 4 && bytes.Equal(data[:4], []byte{'P', 'K', 3, 4}) {
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err == nil {
			for _, file := range reader.File {
				if file.Name == "[Content_Types].xml" {
					return "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nil
				}
			}
		}
	}
	return "", errors.New("unsupported file")
}

func readOptionalUploadBody(w http.ResponseWriter, r *http.Request) (map[string]any, []byte, *multipart.FileHeader, string, error) {
	body := map[string]any{}
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxMultipartBytes)
		if err := r.ParseMultipartForm(maxMultipartBytes); err != nil {
			return nil, nil, nil, "", err
		}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				body[key] = values[0]
			}
		}
		file, header, err := r.FormFile("file")
		if err == http.ErrMissingFile {
			return body, nil, nil, "", nil
		}
		if err != nil {
			return nil, nil, nil, "", err
		}
		defer file.Close()
		if header.Size > maxDocumentBytes {
			return nil, nil, nil, "", &requestError{message: "Ukuran file maksimal 10 MB.", status: 400}
		}
		data, err := io.ReadAll(io.LimitReader(file, maxDocumentBytes+1))
		if err != nil {
			return nil, nil, nil, "", err
		}
		detected, err := detectDocumentMime(data)
		if err != nil {
			return nil, nil, nil, "", &requestError{message: "Hanya file PDF atau DOCX yang diizinkan.", status: 400}
		}
		return body, data, header, detected, nil
	}
	if err := decodeJSON(rwDiscard{}, r, &body); err != nil {
		return nil, nil, nil, "", err
	}
	return body, nil, nil, "", nil
}

type rwDiscard struct{}

func (rwDiscard) Header() http.Header         { return http.Header{} }
func (rwDiscard) Write(p []byte) (int, error) { return len(p), nil }
func (rwDiscard) WriteHeader(int)             {}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func nullableInt(value int64) any {
	if value == 0 {
		return nil
	}
	return value
}
func nullIfEmptyBytes(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}
