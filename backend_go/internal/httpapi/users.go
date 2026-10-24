package httpapi

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var validRoles = map[string]bool{
	"admin": true, "ketua_lppm": true, "dosen": true, "reviewer": true, "mahasiswa": true,
}

var validUserStatuses = map[string]bool{
	"pending": true, "approved": true, "rejected": true,
}

type userRecord struct {
	ID           int64
	Email        string
	Name         string
	FullName     sql.NullString
	Status       string
	NIDN         sql.NullString
	NIM          sql.NullString
	Prodi        sql.NullString
	ProgramStudi sql.NullString
	Institusi    sql.NullString
	Kontak       sql.NullString
	NoHP         sql.NullString
	Alamat       sql.NullString
	TempatLahir  sql.NullString
	TanggalLahir sql.NullTime
	CreatedAt    time.Time
	Roles        []string
}

func (s *Server) registerUserRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/users/search", s.requireAuth(s.searchUsers))
	mux.HandleFunc("PATCH /api/v1/users/profile/me", s.requireAuth(s.updateOwnProfile))
	mux.HandleFunc("PATCH /api/v1/users/profile/password", s.requireAuth(s.changeOwnPassword))
	mux.HandleFunc("GET /api/v1/users", s.requireRoles(s.getUsers, "admin", "ketua_lppm"))
	mux.HandleFunc("GET /api/v1/users/{id}", s.requireRoles(s.getUser, "admin", "ketua_lppm"))
	mux.HandleFunc("PATCH /api/v1/users/{id}/status", s.requireRoles(s.updateUserStatus, "admin"))
	mux.HandleFunc("PATCH /api/v1/users/{id}/roles", s.requireRoles(s.assignUserRoles, "admin"))
	mux.HandleFunc("DELETE /api/v1/users/{id}", s.requireRoles(s.deleteUser, "admin"))
}

func (s *Server) getUsers(w http.ResponseWriter, r *http.Request) {
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		validationError(w, "page", "Expected a positive integer")
		return
	}
	limit, err := queryInt(r, "limit", 10, 1, 100)
	if err != nil {
		validationError(w, "limit", "Expected an integer between 1 and 100")
		return
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	if search == "" {
		search = ""
	}
	role := r.URL.Query().Get("role")
	if role != "" && !validRoles[role] {
		validationError(w, "role", "Invalid role")
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && !validUserStatuses[status] {
		validationError(w, "status", "Invalid status")
		return
	}

	users, total, err := s.listUsers(r, page, limit, search, role, status)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	data := userRecordsJSON(users)
	sendJSON(w, http.StatusOK, responseEnvelope{
		Success: true, Message: "Users fetched", Data: data,
		Meta: map[string]int{"page": page, "limit": limit, "total": total},
	})
}

func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	user, err := s.getUserByID(r, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.internalError(w, r, &requestError{message: "User not found", status: http.StatusNotFound})
		} else {
			s.internalError(w, r, err)
		}
		return
	}
	sendSuccess(w, "User fetched", user.toJSON(), http.StatusOK)
}

func (s *Server) updateUserStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if decodeJSON(w, r, &body) != nil || !validUserStatuses[body.Status] {
		validationError(w, "status", "Invalid status")
		return
	}
	if _, err := s.getUserByID(r, id); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE User SET status = ?, updatedAt = NOW() WHERE id = ?", body.Status, id); err != nil {
		s.internalError(w, r, err)
		return
	}
	var name, email string
	var status string
	if err := s.db.QueryRowContext(r.Context(), "SELECT name, email, status FROM User WHERE id = ?", id).Scan(&name, &email, &status); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Status updated", map[string]any{"id": id, "name": name, "email": email, "status": status}, http.StatusOK)
}

func (s *Server) assignUserRoles(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Roles []string `json:"roles"`
	}
	if decodeJSON(w, r, &body) != nil || len(body.Roles) == 0 {
		validationError(w, "roles", "At least one role is required")
		return
	}
	for _, role := range body.Roles {
		if !validRoles[role] {
			validationError(w, "roles", "Invalid role")
			return
		}
	}
	if _, err := s.getUserByID(r, id); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM UserRole WHERE userId = ?", id); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	for _, role := range body.Roles {
		if _, err := tx.ExecContext(r.Context(),
			"INSERT INTO UserRole (userId, roleId, createdAt) SELECT ?, id, NOW() FROM Role WHERE name = ?",
			id, role); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	user, err := s.getUserByID(r, id)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Roles assigned", user.toJSON(), http.StatusOK)
}

func (s *Server) updateOwnProfile(w http.ResponseWriter, r *http.Request) {
	body := make(map[string]any)
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	allowed := map[string]string{
		"name": "name", "fullName": "fullName", "alamat": "alamat", "kontak": "kontak",
		"noHp": "noHp", "institusi": "institusi", "programStudi": "programStudi",
		"prodi": "prodi", "tempatLahir": "tempatLahir", "tanggalLahir": "tanggalLahir",
	}
	sets := make([]string, 0, len(body))
	args := make([]any, 0, len(body)+1)
	for field, column := range allowed {
		value, exists := body[field]
		if !exists {
			continue
		}
		if field == "tanggalLahir" && value != nil {
			text, ok := value.(string)
			if !ok {
				validationError(w, field, "Expected a date string")
				return
			}
			parsed, err := time.Parse(time.RFC3339Nano, text)
			if err != nil {
				parsed, err = time.Parse("2006-01-02", text)
			}
			if err != nil {
				validationError(w, field, "Invalid datetime")
				return
			}
			value = parsed
		}
		if field == "name" && value != nil {
			text, ok := value.(string)
			if !ok || len(text) < 2 {
				validationError(w, field, "Name must contain at least 2 characters")
				return
			}
		}
		if value != nil {
			if _, ok := value.(string); !ok {
				validationError(w, field, "Expected a string")
				return
			}
		}
		sets = append(sets, "`"+column+"` = ?")
		args = append(args, value)
	}
	if len(sets) > 0 {
		sets = append(sets, "updatedAt = NOW()")
		args = append(args, currentUser(r).UserID)
		query := "UPDATE User SET " + strings.Join(sets, ", ") + " WHERE id = ?"
		if _, err := s.db.ExecContext(r.Context(), query, args...); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	user, err := s.getUserByID(r, currentUser(r).UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Profile updated", user.toJSON(), http.StatusOK)
}

func (s *Server) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	userID := currentUser(r).UserID
	var hash string
	if err := s.db.QueryRowContext(r.Context(), "SELECT password FROM User WHERE id = ?", userID).Scan(&hash); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if err := bcryptCompare(hash, body.OldPassword); err != nil {
		s.internalError(w, r, &requestError{message: "Old password is incorrect", status: http.StatusBadRequest})
		return
	}
	newHash, err := hashPassword(body.NewPassword)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE User SET password = ?, updatedAt = NOW() WHERE id = ?", newHash, userID); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Password changed successfully", nil, http.StatusOK)
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if _, err := s.getUserByID(r, id); err != nil {
		s.userLookupError(w, r, err)
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM User WHERE id = ?", id); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "User deleted", nil, http.StatusOK)
}

func (s *Server) searchUsers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	role := r.URL.Query().Get("role")
	if role != "" && !validRoles[role] {
		validationError(w, "role", "Invalid role")
		return
	}
	limit, err := queryInt(r, "limit", 50, 1, 1_000_000)
	if err != nil {
		validationError(w, "limit", "Expected a positive integer")
		return
	}
	if limit > 200 {
		limit = 200
	}
	roles := []string{"dosen", "mahasiswa"}
	if role != "" {
		roles = []string{role}
	}
	args := []any{"approved"}
	roleMarks := make([]string, len(roles))
	for i, candidate := range roles {
		roleMarks[i] = "?"
		args = append(args, candidate)
	}
	where := "u.status = ? AND EXISTS (SELECT 1 FROM UserRole ur JOIN Role r ON r.id = ur.roleId WHERE ur.userId = u.id AND r.name IN (" + strings.Join(roleMarks, ",") + "))"
	if q != "" {
		where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.fullName LIKE ? OR u.nidn LIKE ? OR u.nim LIKE ?)"
		for i := 0; i < 5; i++ {
			args = append(args, "%"+q+"%")
		}
	}
	query := "SELECT u.id, u.email, u.name, u.fullName, u.status, u.nidn, u.nim, u.prodi, u.programStudi, u.institusi, u.kontak, u.noHp, u.alamat, u.tempatLahir, u.tanggalLahir, u.createdAt FROM User u WHERE " + where + " ORDER BY u.name ASC LIMIT ?"
	args = append(args, limit)
	users, err := s.queryUsers(r, query, args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	result := make([]map[string]any, 0, len(users))
	for _, user := range users {
		result = append(result, map[string]any{
			"id": user.ID, "name": user.Name, "fullName": nullable(user.FullName),
			"email": user.Email, "programStudi": nullable(user.ProgramStudi),
			"prodi": nullable(user.Prodi), "nim": nullable(user.NIM), "nidn": nullable(user.NIDN),
			"roles": roleObjects(user.Roles),
		})
	}
	sendSuccess(w, "Users found", result, http.StatusOK)
}

func (s *Server) listUsers(r *http.Request, page, limit int, search, role, status string) ([]userRecord, int, error) {
	clauses := make([]string, 0, 3)
	args := make([]any, 0, 5)
	if status != "" {
		clauses = append(clauses, "u.status = ?")
		args = append(args, status)
	}
	if search != "" {
		clauses = append(clauses, "(u.name LIKE ? OR u.email LIKE ? OR u.fullName LIKE ?)")
		pattern := "%" + search + "%"
		args = append(args, pattern, pattern, pattern)
	}
	if role != "" {
		clauses = append(clauses, "EXISTS (SELECT 1 FROM UserRole ur JOIN Role r ON r.id = ur.roleId WHERE ur.userId = u.id AND r.name = ?)")
		args = append(args, role)
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM User u"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * limit
	listArgs := append(append([]any{}, args...), limit, offset)
	query := "SELECT u.id, u.email, u.name, u.fullName, u.status, u.nidn, u.nim, u.prodi, u.programStudi, u.institusi, u.kontak, u.noHp, u.alamat, u.tempatLahir, u.tanggalLahir, u.createdAt FROM User u" + where + " ORDER BY u.createdAt DESC LIMIT ? OFFSET ?"
	users, err := s.queryUsers(r, query, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	if err := s.loadRoles(r, users); err != nil {
		return nil, 0, err
	}
	return users, total, nil
}

func (s *Server) getUserByID(r *http.Request, id int64) (*userRecord, error) {
	query := "SELECT id, email, name, fullName, status, nidn, nim, prodi, programStudi, institusi, kontak, noHp, alamat, tempatLahir, tanggalLahir, createdAt FROM User WHERE id = ?"
	users, err := s.queryUsers(r, query, id)
	if err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, sql.ErrNoRows
	}
	if err := s.loadRoles(r, users); err != nil {
		return nil, err
	}
	return &users[0], nil
}

func (s *Server) queryUsers(r *http.Request, query string, args ...any) ([]userRecord, error) {
	rows, err := s.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]userRecord, 0)
	for rows.Next() {
		var user userRecord
		if err := rows.Scan(
			&user.ID, &user.Email, &user.Name, &user.FullName, &user.Status,
			&user.NIDN, &user.NIM, &user.Prodi, &user.ProgramStudi, &user.Institusi,
			&user.Kontak, &user.NoHP, &user.Alamat, &user.TempatLahir, &user.TanggalLahir, &user.CreatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Server) loadRoles(r *http.Request, users []userRecord) error {
	if len(users) == 0 {
		return nil
	}
	marks := make([]string, len(users))
	args := make([]any, len(users))
	index := make(map[int64]int, len(users))
	for i := range users {
		marks[i] = "?"
		args[i] = users[i].ID
		index[users[i].ID] = i
		users[i].Roles = make([]string, 0, 1)
	}
	rows, err := s.db.QueryContext(r.Context(),
		"SELECT ur.userId, r.name FROM UserRole ur JOIN Role r ON r.id = ur.roleId WHERE ur.userId IN ("+strings.Join(marks, ",")+") ORDER BY r.name",
		args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var userID int64
		var role string
		if err := rows.Scan(&userID, &role); err != nil {
			return err
		}
		if i, ok := index[userID]; ok {
			users[i].Roles = append(users[i].Roles, role)
		}
	}
	return rows.Err()
}

func (u userRecord) toJSON() map[string]any {
	var birth any
	if u.TanggalLahir.Valid {
		birth = u.TanggalLahir.Time
	}
	return map[string]any{
		"id": u.ID, "email": u.Email, "name": u.Name, "fullName": nullable(u.FullName),
		"status": u.Status, "nidn": nullable(u.NIDN), "nim": nullable(u.NIM),
		"prodi": nullable(u.Prodi), "programStudi": nullable(u.ProgramStudi),
		"institusi": nullable(u.Institusi), "kontak": nullable(u.Kontak), "noHp": nullable(u.NoHP),
		"alamat": nullable(u.Alamat), "tempatLahir": nullable(u.TempatLahir),
		"tanggalLahir": birth, "createdAt": u.CreatedAt, "roles": roleObjects(u.Roles),
	}
}

func userRecordsJSON(users []userRecord) []map[string]any {
	result := make([]map[string]any, len(users))
	for i, user := range users {
		result[i] = user.toJSON()
	}
	return result
}

func roleObjects(roles []string) []map[string]any {
	result := make([]map[string]any, 0, len(roles))
	for _, role := range roles {
		result = append(result, map[string]any{"role": map[string]string{"name": role}})
	}
	return result
}

func nullable(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}

func (s *Server) userLookupError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, &requestError{message: "User not found", status: http.StatusNotFound})
		return
	}
	s.internalError(w, r, err)
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		validationError(w, "id", "Expected a positive integer")
		return 0, false
	}
	return id, true
}

func queryInt(r *http.Request, key string, fallback, min, max int) (int, error) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < min || parsed > max {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return parsed, nil
}

func validationError(w http.ResponseWriter, field, message string) {
	sendJSON(w, http.StatusUnprocessableEntity, responseEnvelope{
		Success: false,
		Message: "Validation error",
		Errors:  map[string][]string{field: {message}},
	})
}

func bcryptCompare(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}
