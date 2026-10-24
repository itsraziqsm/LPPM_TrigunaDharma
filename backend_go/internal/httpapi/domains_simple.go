package httpapi

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (s *Server) registerSimpleDomainRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/periode", s.requireAuth(s.listPeriode))
	mux.HandleFunc("GET /api/v1/periode/{id}", s.requireAuth(s.getPeriode))
	mux.HandleFunc("POST /api/v1/periode", s.requireRoles(s.createPeriode, "admin", "ketua_lppm"))
	mux.HandleFunc("PATCH /api/v1/periode/{id}", s.requireRoles(s.updatePeriode, "admin", "ketua_lppm"))
	mux.HandleFunc("GET /api/v1/periode/{id}/deletion-request", s.requireRoles(s.pendingPeriodeDeletion, "admin", "ketua_lppm"))
	mux.HandleFunc("POST /api/v1/periode/{id}/deletion-request", s.requireRoles(s.requestPeriodeDeletion, "admin", "ketua_lppm"))
	mux.HandleFunc("POST /api/v1/periode/deletion-request/{requestId}/approve", s.requireRoles(s.approvePeriodeDeletion, "admin", "ketua_lppm"))
	mux.HandleFunc("POST /api/v1/periode/deletion-request/{requestId}/cancel", s.requireRoles(s.cancelPeriodeDeletion, "admin", "ketua_lppm"))

	mux.HandleFunc("GET /api/v1/notifications", s.requireAuth(s.listNotifications))
	mux.HandleFunc("PATCH /api/v1/notifications/read-all", s.requireAuth(s.markAllNotificationsRead))
	mux.HandleFunc("PATCH /api/v1/notifications/{id}/read", s.requireAuth(s.markNotificationRead))
	mux.HandleFunc("DELETE /api/v1/notifications/{id}", s.requireAuth(s.deleteNotification))

	mux.HandleFunc("GET /api/v1/dashboard/stats", s.requireRoles(s.dashboardStats, "admin", "ketua_lppm"))
	mux.HandleFunc("GET /api/v1/activity-logs/my", s.requireAuth(s.myActivityLogs))
	mux.HandleFunc("GET /api/v1/activity-logs", s.requireRoles(s.allActivityLogs, "admin", "ketua_lppm"))
	mux.HandleFunc("GET /api/v1/export/proposals", s.requireRoles(s.exportProposals, "admin", "ketua_lppm"))
}

func (s *Server) listPeriode(w http.ResponseWriter, r *http.Request) {
	query := "SELECT * FROM Periode WHERE 1=1"
	args := []any{}
	if value := r.URL.Query().Get("jenis"); value != "" {
		if value != "penelitian" && value != "pengabdian" {
			validationError(w, "jenis", "Invalid jenis")
			return
		}
		query += " AND jenis = ?"
		args = append(args, value)
	}
	if value := r.URL.Query().Get("tahun"); value != "" {
		year, err := strconv.Atoi(value)
		if err != nil {
			validationError(w, "tahun", "Expected a number")
			return
		}
		query += " AND tahun = ?"
		args = append(args, year)
	}
	if value := r.URL.Query().Get("isAktif"); value != "" {
		if value != "true" && value != "false" {
			validationError(w, "isAktif", "Expected true or false")
			return
		}
		query += " AND isAktif = ?"
		args = append(args, value == "true")
	}
	query += " ORDER BY tahun DESC, createdAt DESC"
	result, err := queryMaps(r, s.db, query, args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Periode fetched", result, http.StatusOK)
}

func (s *Server) getPeriode(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	result, err := queryOneMap(r, s.db, "SELECT * FROM Periode WHERE id = ?", id)
	if errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, &requestError{message: "Periode tidak ditemukan", status: http.StatusNotFound})
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Periode fetched", result, http.StatusOK)
}

type periodeInput struct {
	Nama           string `json:"nama"`
	Tahun          int    `json:"tahun"`
	Jenis          string `json:"jenis"`
	TanggalMulai   string `json:"tanggalMulai"`
	TanggalSelesai string `json:"tanggalSelesai"`
	IsAktif        *bool  `json:"isAktif"`
}

func (s *Server) createPeriode(w http.ResponseWriter, r *http.Request) {
	var body periodeInput
	if decodeJSON(w, r, &body) != nil || !validPeriodeInput(body, true) {
		validationError(w, "body", "Invalid periode data")
		return
	}
	start, _ := parseDate(body.TanggalMulai)
	end, _ := parseDate(body.TanggalSelesai)
	active := true
	if body.IsAktif != nil {
		active = *body.IsAktif
	}
	result, err := s.db.ExecContext(r.Context(),
		"INSERT INTO Periode (nama, tahun, jenis, tanggalMulai, tanggalSelesai, isAktif, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
		body.Nama, body.Tahun, body.Jenis, start, end, active)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	created, err := queryOneMap(r, s.db, "SELECT * FROM Periode WHERE id = ?", id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Periode created", created, http.StatusCreated)
}

func (s *Server) updatePeriode(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body map[string]any
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	validFields := map[string]bool{"nama": true, "tahun": true, "jenis": true, "tanggalMulai": true, "tanggalSelesai": true, "isAktif": true}
	sets, args := []string{}, []any{}
	for key, value := range body {
		if !validFields[key] {
			continue
		}
		switch key {
		case "tanggalMulai", "tanggalSelesai":
			text, ok := value.(string)
			if !ok {
				validationError(w, key, "Invalid date")
				return
			}
			parsed, err := parseDate(text)
			if err != nil {
				validationError(w, key, "Invalid date")
				return
			}
			value = parsed
		case "jenis":
			if value != "penelitian" && value != "pengabdian" {
				validationError(w, key, "Invalid jenis")
				return
			}
		}
		sets = append(sets, "`"+key+"` = ?")
		args = append(args, value)
	}
	if len(sets) > 0 {
		sets = append(sets, "updatedAt = NOW()")
		args = append(args, id)
		if _, err := s.db.ExecContext(r.Context(), "UPDATE Periode SET "+strings.Join(sets, ", ")+" WHERE id = ?", args...); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	updated, err := queryOneMap(r, s.db, "SELECT * FROM Periode WHERE id = ?", id)
	if errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, &requestError{message: "Periode tidak ditemukan", status: http.StatusNotFound})
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Periode updated", updated, http.StatusOK)
}

func (s *Server) pendingPeriodeDeletion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	item, err := queryOneMap(r, s.db,
		"SELECT d.*, JSON_OBJECT('id', u.id, 'name', u.name) AS requester FROM PeriodeDeletionRequest d JOIN User u ON u.id = d.requesterId WHERE d.periodeId = ? AND d.status = 'pending' AND d.expiresAt > NOW() ORDER BY d.createdAt DESC LIMIT 1", id)
	if errors.Is(err, sql.ErrNoRows) {
		sendJSON(w, http.StatusOK, responseEnvelope{Success: true, Message: "Pending deletion request", Data: jsonNull})
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Pending deletion request", item, http.StatusOK)
}

func (s *Server) requestPeriodeDeletion(w http.ResponseWriter, r *http.Request) {
	periodeID, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if decodeJSON(w, r, &body) != nil || body.Password == "" {
		sendError(w, "Password wajib diisi", http.StatusBadRequest)
		return
	}
	user := currentUser(r)
	var hash, periodeName string
	if err := s.db.QueryRowContext(r.Context(), "SELECT password FROM User WHERE id = ?", user.UserID).Scan(&hash); err != nil {
		s.internalError(w, r, &requestError{message: "Password salah", status: http.StatusBadRequest})
		return
	}
	if bcryptCompare(hash, body.Password) != nil {
		s.internalError(w, r, &requestError{message: "Password salah", status: http.StatusBadRequest})
		return
	}
	if err := s.db.QueryRowContext(r.Context(), "SELECT nama FROM Periode WHERE id = ?", periodeID).Scan(&periodeName); err != nil {
		s.internalError(w, r, &requestError{message: "Periode tidak ditemukan", status: http.StatusNotFound})
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	_, err = tx.ExecContext(r.Context(), "UPDATE PeriodeDeletionRequest SET status = 'cancelled', updatedAt = NOW() WHERE periodeId = ? AND status = 'pending'", periodeID)
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	var expiry time.Time
	expiry = time.Now().Add(24 * time.Hour)
	result, err := tx.ExecContext(r.Context(), "INSERT INTO PeriodeDeletionRequest (periodeId, requesterId, status, expiresAt, createdAt, updatedAt) VALUES (?, ?, 'pending', ?, NOW(), NOW())", periodeID, user.UserID, expiry)
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	requestID, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	targetRole := "admin"
	for _, role := range user.Roles {
		if role == "admin" {
			targetRole = "ketua_lppm"
			break
		}
	}
	_, err = s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId, type, judul, pesan, refId, refType, isRead, createdAt) SELECT u.id, 'deletion_request', 'Permintaan Penghapusan Periode', ?, ?, 'PeriodeDeletionRequest', FALSE, NOW() FROM User u JOIN UserRole ur ON ur.userId = u.id JOIN Role rl ON rl.id = ur.roleId WHERE rl.name = ? AND u.status = 'approved'",
		fmt.Sprintf("Ada permintaan penghapusan periode %q. Masuk ke halaman Periode untuk menyetujui atau membatalkan.", periodeName), requestID, targetRole)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Permintaan penghapusan berhasil dibuat", map[string]any{"requestId": requestID, "expiresAt": expiry}, http.StatusOK)
}

func (s *Server) approvePeriodeDeletion(w http.ResponseWriter, r *http.Request) {
	requestID, ok := pathRequestID(w, r)
	if !ok {
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if decodeJSON(w, r, &body) != nil || body.Password == "" {
		sendError(w, "Password wajib diisi", http.StatusBadRequest)
		return
	}
	user := currentUser(r)
	var hash string
	if err := s.db.QueryRowContext(r.Context(), "SELECT password FROM User WHERE id = ?", user.UserID).Scan(&hash); err != nil || bcryptCompare(hash, body.Password) != nil {
		s.internalError(w, r, &requestError{message: "Password salah", status: http.StatusBadRequest})
		return
	}
	var periodeID, requesterID int64
	var periodeName string
	var requesterRole string
	err := s.db.QueryRowContext(r.Context(), "SELECT d.periodeId, d.requesterId, p.nama, r.name FROM PeriodeDeletionRequest d JOIN Periode p ON p.id = d.periodeId JOIN UserRole ur ON ur.userId = d.requesterId JOIN Role r ON r.id = ur.roleId WHERE d.id = ? AND d.status = 'pending' AND d.expiresAt > NOW() ORDER BY r.name LIMIT 1",
		requestID).Scan(&periodeID, &requesterID, &periodeName, &requesterRole)
	if err != nil {
		s.internalError(w, r, &requestError{message: "Permintaan penghapusan tidak ditemukan atau sudah tidak valid", status: http.StatusNotFound})
		return
	}
	if requesterID == user.UserID || (requesterRole == "admin" && !contains(user.Roles, "ketua_lppm")) || (requesterRole == "ketua_lppm" && !contains(user.Roles, "admin")) {
		s.internalError(w, r, &requestError{message: "Tidak dapat menyetujui permintaan yang Anda buat sendiri", status: http.StatusBadRequest})
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), "UPDATE PeriodeDeletionRequest SET status = 'approved', approverId = ?, updatedAt = NOW() WHERE id = ?", user.UserID, requestID); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM Periode WHERE id = ?", periodeID); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), "INSERT INTO Notification (userId, type, judul, pesan, refId, refType, isRead, createdAt) VALUES (?, 'deletion_approved', 'Periode Berhasil Dihapus', ?, ?, 'PeriodeDeletionRequest', FALSE, NOW())",
		requesterID, fmt.Sprintf("Periode %q telah dihapus setelah disetujui.", periodeName), requestID); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Periode berhasil dihapus", nil, http.StatusOK)
}

func (s *Server) cancelPeriodeDeletion(w http.ResponseWriter, r *http.Request) {
	requestID, ok := pathRequestID(w, r)
	if !ok {
		return
	}
	user := currentUser(r)
	var requesterID int64
	var periodeName string
	err := s.db.QueryRowContext(r.Context(), "SELECT d.requesterId, p.nama FROM PeriodeDeletionRequest d JOIN Periode p ON p.id = d.periodeId WHERE d.id = ? AND d.status = 'pending'", requestID).Scan(&requesterID, &periodeName)
	if err != nil {
		s.internalError(w, r, &requestError{message: "Permintaan penghapusan tidak ditemukan atau sudah tidak valid", status: http.StatusNotFound})
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE PeriodeDeletionRequest SET status = 'cancelled', updatedAt = NOW() WHERE id = ?", requestID); err != nil {
		s.internalError(w, r, err)
		return
	}
	if requesterID != user.UserID {
		_, err = s.db.ExecContext(r.Context(), "INSERT INTO Notification (userId, type, judul, pesan, refId, refType, isRead, createdAt) VALUES (?, 'deletion_cancelled', 'Permintaan Penghapusan Dibatalkan', ?, ?, 'PeriodeDeletionRequest', FALSE, NOW())",
			requesterID, fmt.Sprintf("Permintaan penghapusan periode %q telah dibatalkan.", periodeName), requestID)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	sendSuccess(w, "Permintaan penghapusan dibatalkan", nil, http.StatusOK)
}

func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		validationError(w, "page", "Expected a positive integer")
		return
	}
	limit, err := queryInt(r, "limit", 20, 1, 1000)
	if err != nil {
		validationError(w, "limit", "Expected a positive integer")
		return
	}
	where := "userId = ?"
	args := []any{currentUser(r).UserID}
	if r.URL.Query().Get("onlyUnread") == "true" {
		where += " AND isRead = FALSE"
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM Notification WHERE "+where, args...).Scan(&total); err != nil {
		s.internalError(w, r, err)
		return
	}
	args = append(args, limit, (page-1)*limit)
	rows, err := queryMaps(r, s.db, "SELECT * FROM Notification WHERE "+where+" ORDER BY createdAt DESC LIMIT ? OFFSET ?", args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendJSON(w, http.StatusOK, responseEnvelope{
		Success: true, Message: "Notifications fetched",
		Data: rows, Meta: map[string]int{"page": page, "limit": limit, "total": total},
	})
}

func (s *Server) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE Notification SET isRead = TRUE WHERE id = ? AND userId = ?", id, currentUser(r).UserID); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Notification marked as read", nil, http.StatusOK)
}

func (s *Server) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if _, err := s.db.ExecContext(r.Context(), "UPDATE Notification SET isRead = TRUE WHERE userId = ? AND isRead = FALSE", currentUser(r).UserID); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "All notifications marked as read", nil, http.StatusOK)
}

func (s *Server) deleteNotification(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM Notification WHERE id = ? AND userId = ?", id, currentUser(r).UserID); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Notification deleted", nil, http.StatusOK)
}

func (s *Server) dashboardStats(w http.ResponseWriter, r *http.Request) {
	where := "1=1"
	args := []any{}
	if year := r.URL.Query().Get("tahun"); year != "" {
		n, err := strconv.Atoi(year)
		if err != nil {
			validationError(w, "tahun", "Expected a number")
			return
		}
		where += " AND (p.periodeId IN (SELECT id FROM Periode WHERE tahun = ?) OR (p.periodeId IS NULL AND YEAR(p.createdAt) = ?))"
		args = append(args, n, n)
	}
	if kind := r.URL.Query().Get("jenis"); kind != "" {
		if kind != "penelitian" && kind != "pengabdian" {
			validationError(w, "jenis", "Invalid jenis")
			return
		}
		where += " AND p.jenis = ?"
		args = append(args, kind)
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM Proposal p WHERE "+where, args...).Scan(&total); err != nil {
		s.internalError(w, r, err)
		return
	}
	status, err := queryMaps(r, s.db, "SELECT p.status, COUNT(*) AS count FROM Proposal p WHERE "+where+" GROUP BY p.status", args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	jenis, err := queryMaps(r, s.db, "SELECT p.jenis, COUNT(*) AS count FROM Proposal p GROUP BY p.jenis")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	prodi, err := queryMaps(r, s.db, "SELECT COALESCE(u.programStudi, 'Tidak Diketahui') AS programStudi, COUNT(*) AS count FROM Proposal p JOIN User u ON u.id = p.pengusulId WHERE "+where+" GROUP BY u.programStudi", args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	years, err := queryMaps(r, s.db, "SELECT COALESCE(pe.tahun, YEAR(p.createdAt)) AS tahun, COUNT(*) AS count FROM Proposal p LEFT JOIN Periode pe ON pe.id = p.periodeId GROUP BY tahun ORDER BY tahun ASC")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	var approvedUsers, dosen, reviewer int
	_ = s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM User WHERE status = 'approved'").Scan(&approvedUsers)
	_ = s.db.QueryRowContext(r.Context(), "SELECT COUNT(DISTINCT u.id) FROM User u JOIN UserRole ur ON ur.userId = u.id JOIN Role r ON r.id = ur.roleId WHERE u.status = 'approved' AND r.name = 'dosen'").Scan(&dosen)
	_ = s.db.QueryRowContext(r.Context(), "SELECT COUNT(DISTINCT u.id) FROM User u JOIN UserRole ur ON ur.userId = u.id JOIN Role r ON r.id = ur.roleId WHERE u.status = 'approved' AND r.name = 'reviewer'").Scan(&reviewer)
	activePeriods, err := queryMaps(r, s.db, "SELECT id, nama, tahun, jenis FROM Periode WHERE isAktif = TRUE")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Dashboard stats fetched", map[string]any{
		"totalProposal": total, "perStatus": status, "perJenis": jenis, "perProdi": prodi, "perTahun": years,
		"users":        map[string]int{"total": approvedUsers, "dosen": dosen, "reviewer": reviewer},
		"periodeAktif": activePeriods,
	}, http.StatusOK)
}

func (s *Server) myActivityLogs(w http.ResponseWriter, r *http.Request) {
	s.listActivityLogs(w, r, true)
}

func (s *Server) allActivityLogs(w http.ResponseWriter, r *http.Request) {
	s.listActivityLogs(w, r, false)
}

func (s *Server) listActivityLogs(w http.ResponseWriter, r *http.Request, own bool) {
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		validationError(w, "page", "Expected a positive integer")
		return
	}
	limit, err := queryInt(r, "limit", 20, 1, 1000)
	if err != nil {
		validationError(w, "limit", "Expected a positive integer")
		return
	}
	where, args := "1=1", []any{}
	if own {
		where += " AND a.userId = ?"
		args = append(args, currentUser(r).UserID)
	} else {
		if value := r.URL.Query().Get("userId"); value != "" {
			userID, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				validationError(w, "userId", "Expected an integer")
				return
			}
			where += " AND a.userId = ?"
			args = append(args, userID)
		}
		if value := r.URL.Query().Get("action"); value != "" {
			where += " AND a.action LIKE ?"
			args = append(args, "%"+value+"%")
		}
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM ActivityLog a WHERE "+where, args...).Scan(&total); err != nil {
		s.internalError(w, r, err)
		return
	}
	selectExtra := "u.id AS user_id, u.name AS user_name, u.email AS user_email, p.id AS proposal_id, p.judul AS proposal_judul, p.jenis AS proposal_jenis"
	query := "SELECT a.*, " + selectExtra + " FROM ActivityLog a LEFT JOIN User u ON u.id = a.userId LEFT JOIN Proposal p ON p.id = a.proposalId WHERE " + where + " ORDER BY a.createdAt DESC LIMIT ? OFFSET ?"
	args = append(args, limit, (page-1)*limit)
	logs, err := queryMaps(r, s.db, query, args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	for _, item := range logs {
		item["proposal"] = nil
		if item["proposal_id"] != nil {
			item["proposal"] = map[string]any{"id": item["proposal_id"], "judul": item["proposal_judul"], "jenis": item["proposal_jenis"]}
		}
		delete(item, "proposal_id")
		delete(item, "proposal_judul")
		delete(item, "proposal_jenis")
		if own {
			continue
		}
		item["user"] = map[string]any{"id": item["user_id"], "name": item["user_name"], "email": item["user_email"]}
		delete(item, "user_id")
		delete(item, "user_name")
		delete(item, "user_email")
	}
	sendJSON(w, http.StatusOK, responseEnvelope{
		Success: true, Message: "Activity logs fetched", Data: logs,
		Meta: map[string]int{"page": page, "limit": limit, "total": total},
	})
}

func (s *Server) exportProposals(w http.ResponseWriter, r *http.Request) {
	where, args := "1=1", []any{}
	for key, column := range map[string]string{"periodeId": "p.periodeId", "jenis": "p.jenis", "status": "p.status", "programStudi": "u.programStudi"} {
		if value := r.URL.Query().Get(key); value != "" {
			where += " AND " + column + " = ?"
			if key == "periodeId" || key == "tahun" {
				n, err := strconv.Atoi(value)
				if err != nil {
					validationError(w, key, "Expected a number")
					return
				}
				args = append(args, n)
			} else {
				args = append(args, value)
			}
		}
	}
	if year := r.URL.Query().Get("tahun"); year != "" {
		n, err := strconv.Atoi(year)
		if err != nil {
			validationError(w, "tahun", "Expected a number")
			return
		}
		where += " AND pe.tahun = ?"
		args = append(args, n)
	}
	proposals, err := queryMaps(r, s.db, "SELECT p.id, p.judul, p.jenis, p.status, p.anggaran, p.submittedAt, p.approvedAt, p.createdAt, p.catatanRevisi, u.name AS pengusulName, u.fullName AS pengusulFullName, u.email AS pengusulEmail, u.nidn, u.programStudi, pe.id AS periodeId, pe.nama AS periodeNama, pe.tahun AS periodeTahun, COALESCE((SELECT GROUP_CONCAT(CONCAT(COALESCE(au.fullName,au.name),' (',a.peran,')') SEPARATOR '; ') FROM ProposalAnggota a JOIN User au ON au.id=a.userId WHERE a.proposalId=p.id),' - ') AS anggota, COALESCE((SELECT GROUP_CONCAT(COALESCE(ru.fullName,ru.name) SEPARATOR '; ') FROM ReviewerTugasan t JOIN User ru ON ru.id=t.reviewerId WHERE t.proposalId=p.id),' - ') AS reviewer, (SELECT COUNT(*) FROM ProposalReview rv WHERE rv.proposalId=p.id) AS jumlahReview, (SELECT COUNT(*) FROM ProposalReview rv WHERE rv.proposalId=p.id AND rv.isDone=TRUE) AS reviewSelesai FROM Proposal p JOIN User u ON u.id = p.pengusulId LEFT JOIN Periode pe ON pe.id = p.periodeId WHERE "+where+" ORDER BY pe.tahun DESC, p.createdAt DESC", args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	countStatus, countKind, countProdi := map[string]int{}, map[string]int{}, map[string]int{}
	rows := make([]map[string]any, 0, len(proposals))
	for i, proposal := range proposals {
		status, _ := proposal["status"].(string)
		kind, _ := proposal["jenis"].(string)
		prodi, _ := proposal["programStudi"].(string)
		countStatus[status]++
		countKind[kind]++
		if prodi == "" {
			prodi = "Tidak Diketahui"
		}
		countProdi[prodi]++
		statusLabels := map[string]string{"draft": "Draft", "diajukan": "Diajukan", "review": "Sedang Direview", "revisi": "Revisi", "disetujui": "Disetujui", "ditolak": "Ditolak"}
		kindLabels := map[string]string{"penelitian": "Penelitian", "pengabdian": "Pengabdian"}
		period := "-"
		if proposal["periodeNama"] != nil {
			period = fmt.Sprintf("%v (%v)", proposal["periodeNama"], proposal["periodeTahun"])
		}
		owner := proposal["pengusulFullName"]
		if owner == nil || owner == "" {
			owner = proposal["pengusulName"]
		}
		nidn, program := proposal["nidn"], proposal["programStudi"]
		if nidn == nil || nidn == "" {
			nidn = "-"
		}
		if program == nil || program == "" {
			program = "-"
		}
		rows = append(rows, map[string]any{
			"no": i + 1, "id": proposal["id"], "judul": proposal["judul"],
			"jenis": kindLabels[kind], "status": statusLabels[status], "pengusul": owner,
			"nidn": nidn, "programStudi": program, "periode": period,
			"anggaran": formatIndonesianNumber(proposal["anggaran"]), "anggota": proposal["anggota"], "reviewer": proposal["reviewer"],
			"jumlahReview": proposal["jumlahReview"], "reviewSelesai": proposal["reviewSelesai"], "catatanRevisi": fallback(proposal["catatanRevisi"], "-"),
			"submittedAt": formatDate(proposal["submittedAt"]), "approvedAt": formatDate(proposal["approvedAt"]),
			"createdAt": formatDate(proposal["createdAt"]),
		})
	}
	sendSuccess(w, "Export data fetched", map[string]any{
		"total": len(rows),
		"ringkasan": map[string]any{
			"perStatus": countItems(countStatus, "label", statusExportLabel),
			"perJenis":  countItems(countKind, "label", kindExportLabel),
			"perProdi":  prodiExportRows(countProdi),
		},
		"rows": rows, "generatedAt": time.Now().UTC().Format(time.RFC3339Nano),
	}, http.StatusOK)
}

func validPeriodeInput(body periodeInput, requireAll bool) bool {
	if len(body.Nama) < 3 || body.Tahun < 2000 || body.Tahun > 2100 ||
		(body.Jenis != "penelitian" && body.Jenis != "pengabdian") {
		return false
	}
	start, err := parseDate(body.TanggalMulai)
	if err != nil {
		return false
	}
	end, err := parseDate(body.TanggalSelesai)
	if err != nil {
		return false
	}
	return !requireAll || !end.Before(start)
}

func parseDate(value string) (time.Time, error) {
	if date, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return date, nil
	}
	return time.Parse("2006-01-02", value)
}

func pathRequestID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("requestId"), 10, 64)
	if err != nil || id <= 0 {
		validationError(w, "requestId", "Expected a positive integer")
		return 0, false
	}
	return id, true
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func fallback(value any, replacement string) any {
	if value == nil || value == "" {
		return replacement
	}
	return value
}

func formatDate(value any) string {
	if value == nil {
		return "-"
	}
	switch date := value.(type) {
	case time.Time:
		return date.Format("02/01/2006")
	case []byte:
		if parsed, err := time.Parse("2006-01-02 15:04:05", string(date)); err == nil {
			return parsed.Format("02/01/2006")
		}
	}
	return fmt.Sprint(value)
}

func countItems(counts map[string]int, key string, label func(string) string) []map[string]any {
	result := make([]map[string]any, 0, len(counts))
	for value, count := range counts {
		result = append(result, map[string]any{key: label(value), "count": count})
	}
	return result
}

func prodiExportRows(counts map[string]int) []map[string]any {
	sorted := make([]struct {
		name  string
		count int
	}, 0, len(counts))
	for prodi, count := range counts {
		sorted = append(sorted, struct {
			name  string
			count int
		}{name: prodi, count: count})
	}
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].count > sorted[j].count })
	result := make([]map[string]any, 0, len(sorted))
	for _, item := range sorted {
		result = append(result, map[string]any{"programStudi": item.name, "count": item.count})
	}
	return result
}

func formatIndonesianNumber(value any) string {
	if value == nil || value == "" {
		return "-"
	}
	amount, err := strconv.ParseFloat(fmt.Sprint(value), 64)
	if err != nil || amount == 0 {
		return "-"
	}
	text := strconv.FormatFloat(amount, 'f', -1, 64)
	parts := strings.SplitN(text, ".", 2)
	integer := parts[0]
	negative := strings.HasPrefix(integer, "-")
	if negative {
		integer = strings.TrimPrefix(integer, "-")
	}
	var grouped strings.Builder
	for i, digit := range integer {
		if i > 0 && (len(integer)-i)%3 == 0 {
			grouped.WriteByte('.')
		}
		grouped.WriteRune(digit)
	}
	result := grouped.String()
	if negative {
		result = "-" + result
	}
	if len(parts) == 2 {
		result += "," + parts[1]
	}
	return result
}

func statusExportLabel(value string) string {
	labels := map[string]string{"draft": "Draft", "diajukan": "Diajukan", "review": "Sedang Direview", "revisi": "Revisi", "disetujui": "Disetujui", "ditolak": "Ditolak"}
	if labels[value] == "" {
		return value
	}
	return labels[value]
}

func kindExportLabel(value string) string {
	if value == "penelitian" {
		return "Penelitian"
	}
	if value == "pengabdian" {
		return "Pengabdian"
	}
	return value
}
