package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
)

// Node: routes/user.routes.ts, controllers/user.controller.ts,
// services/user.service.ts.

var (
	roleNames   = []string{"admin", "ketua_lppm", "dosen", "reviewer", "mahasiswa"}
	userStatus  = []string{"pending", "approved", "rejected"}
	userColumns = "u.`id`,u.`email`,u.`name`,u.`fullName`,u.`status`,u.`nidn`,u.`nim`,u.`prodi`,u.`programStudi`,u.`institusi`,u.`kontak`,u.`noHp`,u.`alamat`,u.`tempatLahir`,u.`tanggalLahir`,u.`createdAt`"
	// profileColumns: profil milik sendiri (GET/PATCH /users/profile/me) = userColumns +
	// jabatanFungsional, sintaId, sintaScore; fotoUrl dihitung dari UserFoto (__foto).
	profileColumns = "u.`id`,u.`email`,u.`name`,u.`fullName`,u.`status`,u.`nidn`,u.`nim`,u.`prodi`,u.`programStudi`,u.`institusi`,u.`kontak`,u.`noHp`,u.`alamat`,u.`tempatLahir`,u.`tanggalLahir`," +
		"u.`jabatanFungsional`,u.`sintaId`,u.`sintaScore`,(SELECT f.`updatedAt` FROM `UserFoto` f WHERE f.`userId` = u.`id`) AS `__foto`,u.`emailVerifiedAt`,u.`createdAt`"

	paginationSchema = zObj(
		withDefault("page", zNum().Coerce().Int().Min(1), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Min(1).Max(100), float64(10)),
		optional("search", zStr()),
		optional("role", zEnumOf(roleNames...)),
		optional("status", zEnumOf(userStatus...)),
	)
	updateUserStatusSchema = zObj(required("status", zEnumOf(userStatus...)))
	assignRoleSchema       = zObj(required("roles", &zArray{elem: zEnumOf(roleNames...), min: 1}))
)

func (s *Server) registerUserRoutes() {
	g := s.group("/api/v1/users", s.authenticate)
	g.get("/search", s.searchUsers)
	g.get("/profile/me", s.getProfile) // baru (W-08), tidak ada di Node
	g.patch("/profile/me", s.updateProfile)
	g.delete("/profile/me", validateBody(deleteAccountSchema), s.deleteOwnAccount) // baru (W-21)
	g.get("/profile/export", s.exportAccount)                                      // baru (W-20)
	g.post("/profile/foto", multerImage("file"), s.uploadProfileFoto)              // baru (W-07)
	g.delete("/profile/foto", s.deleteProfileFoto)                                 // baru (W-07)
	g.patch("/profile/password", s.changePassword)
	g.get("/", authorize("admin", "ketua_lppm"), s.validateQuery(paginationSchema), s.getUsers)
	g.get("/:id", authorize("admin", "ketua_lppm"), s.getUser)
	g.patch("/:id/status", authorize("admin"), validateBody(updateUserStatusSchema), s.updateUserStatus)
	// Go saja (W-30): ketua_lppm boleh, tetapi hanya untuk menambah/mencabut reviewer pada dosen.
	g.patch("/:id/roles", authorize("admin", "ketua_lppm"), validateBody(assignRoleSchema), s.assignRoles)
	g.delete("/:id", authorize("admin"), s.deleteUser)
}

// validateQuery mirrors validate(schema, "query"); the parsed query is kept
// in c.body-independent storage (validatedQuery).
func (s *Server) validateQuery(schema zSchema) step {
	return func(c *Ctx) error {
		out, issues := safeParse(schema, queryAsAny(c.query))
		if issues != nil {
			c.s.validationFailed(c.w, c.r, fieldErrors(issues))
			return errStop
		}
		c.validatedQuery = out
		return nil
	}
}

// attachUserRoles adds roles: [{role:{name}}] (Prisma select roles.role.name).
func attachUserRoles(ctx context.Context, q dbtx, users []O, idKey string) error {
	ids := uniqueIDs(users, idKey)
	byUser := map[int64][]any{}
	if len(ids) > 0 {
		rows, err := queryObjs(ctx, q, fmt.Sprintf(userRolesByUserIDsQuery, placeholders(len(ids))), idArgs(ids)...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			k := row.Int64("__k")
			byUser[k] = append(byUser[k], O{{"role", O{{"name", row.Get("name")}}}})
		}
	}
	for i := range users {
		roles := byUser[users[i].Int64(idKey)]
		if roles == nil {
			roles = []any{}
		}
		users[i].Set("roles", roles)
	}
	return nil
}

// selectUsers runs USER_SELECT for the given WHERE clause.
func (s *Server) selectUsers(ctx context.Context, q dbtx, tail string, args ...any) ([]O, error) {
	users, err := queryObjs(ctx, q, "SELECT "+userColumns+" FROM `User` u "+tail, args...)
	if err != nil {
		return nil, err
	}
	if err := attachUserRoles(ctx, q, users, "id"); err != nil {
		return nil, err
	}
	return users, nil
}

// profileByID returns the user's own profile (profileColumns + roles).
func (s *Server) profileByID(ctx context.Context, id int64) (O, error) {
	users, err := queryObjs(ctx, s.db, "SELECT "+profileColumns+" FROM `User` u WHERE u.`id` = ?", id)
	if err != nil || len(users) == 0 {
		return nil, err
	}
	setFotoURL(&users[0], id)
	if err := attachUserRoles(ctx, s.db, users, "id"); err != nil {
		return nil, err
	}
	return users[0], nil
}

func (s *Server) getProfile(c *Ctx) error {
	user, err := s.profileByID(c.r.Context(), c.user.UserID)
	if err != nil {
		return err
	}
	if user == nil {
		return httpError(http.StatusNotFound, "User not found")
	}
	return c.ok("Profile fetched", user)
}

func (s *Server) userByID(ctx context.Context, q dbtx, id int64) (O, error) {
	users, err := s.selectUsers(ctx, q, "WHERE u.`id` = ?", id)
	if err != nil || len(users) == 0 {
		return nil, err
	}
	return users[0], nil
}

func (s *Server) ensureUserExists(ctx context.Context, id int64) (string, error) {
	var password string
	err := s.db.QueryRowContext(ctx, "SELECT `password` FROM `User` WHERE `id` = ?", id).Scan(&password)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httpError(http.StatusNotFound, "User not found")
	}
	return password, err
}

func (s *Server) getUsers(c *Ctx) error {
	// controller re-parses the validated query with its own schema
	q := c.validatedQuery
	page := q["page"].(float64)
	limit := q["limit"].(float64)
	search, _ := q["search"].(string)
	role, _ := q["role"].(string)
	status, _ := q["status"].(string)

	clauses := []string{}
	args := []any{}
	if status != "" {
		clauses = append(clauses, "u.`status` = ?")
		args = append(args, status)
	}
	if search != "" {
		clauses = append(clauses, "(u.`name` LIKE ? OR u.`email` LIKE ? OR u.`fullName` LIKE ?)")
		like := "%" + search + "%"
		args = append(args, like, like, like)
	}
	if role != "" {
		clauses = append(clauses, "EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = ?)")
		args = append(args, role)
	}
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}
	ctx := c.r.Context()
	skip, take, err := paginationArgs(page, limit)
	if err != nil {
		return err
	}
	users, err := s.selectUsers(ctx, s.db, where+" ORDER BY u.`createdAt` DESC LIMIT ? OFFSET ?", append(append([]any{}, args...), take, skip)...)
	if err != nil {
		return err
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `User` u "+where, args...)
	if err != nil {
		return err
	}
	return c.okMeta("Users fetched", users, int64(page), int64(limit), total)
}

func userIDParam(c *Ctx) (int64, error) {
	ids, err := positiveIntParams(c, "id")
	if err != nil {
		return 0, err
	}
	return ids["id"], nil
}

func (s *Server) getUser(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	user, err := s.userByID(c.r.Context(), s.db, id)
	if err != nil {
		return err
	}
	if user == nil {
		return httpError(http.StatusNotFound, "User not found")
	}
	return c.ok("User fetched", user)
}

func (s *Server) updateUserStatus(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	status, _ := getString(c.bodyMap(), "status")
	ctx := c.r.Context()
	if _, err := s.ensureUserExists(ctx, id); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `User` SET `status` = ?, `updatedAt` = ? WHERE `id` = ?", status, s.nowMs(), id); err != nil {
		return err
	}
	user, err := queryObj(ctx, s.db, "SELECT `id`,`name`,`email`,`status` FROM `User` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	return c.ok("Status updated", user)
}

func (s *Server) assignRoles(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if _, err := s.ensureUserExists(ctx, id); err != nil {
		return err
	}
	list, _ := c.bodyMap()["roles"].([]any)
	if !hasAnyRole(c.user.Roles, "admin") {
		if err := s.checkKetuaReviewerChange(c, id, list); err != nil {
			return err
		}
	}
	names := make([]any, 0, len(list))
	for _, r := range list {
		names = append(names, r)
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "DELETE FROM `UserRole` WHERE `userId` = ?", id); err != nil {
			return err
		}
		if len(names) == 0 {
			return nil
		}
		_, err := tx.ExecContext(ctx,
			"INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) SELECT ?, `id`, ? FROM `Role` WHERE `name` IN ("+placeholders(len(names))+") ORDER BY `id`",
			append([]any{id, now}, names...)...)
		return err
	})
	if err != nil {
		return err
	}
	user, err := s.userByID(ctx, s.db, id)
	if err != nil {
		return err
	}
	var data any
	if user != nil {
		data = user
	}
	return c.ok("Roles assigned", data)
}

// checkKetuaReviewerChange (W-30): ketua_lppm hanya boleh mengubah peran
// `reviewer` pada user yang berperan dosen; peran lain harus tetap sama.
func (s *Server) checkKetuaReviewerChange(c *Ctx, userID int64, requested []any) error {
	current, err := s.rolesOf(c.r.Context(), s.db, userID)
	if err != nil {
		return err
	}
	denied := httpError(http.StatusForbidden, "Ketua LPPM hanya dapat menambah atau mencabut peran reviewer pada dosen")
	if !hasAnyRole(current, "dosen") {
		return denied
	}
	without := func(names []string) map[string]bool {
		set := map[string]bool{}
		for _, n := range names {
			if n != "reviewer" {
				set[n] = true
			}
		}
		return set
	}
	next := make([]string, 0, len(requested))
	for _, r := range requested {
		if name, ok := r.(string); ok {
			next = append(next, name)
		}
	}
	a, b := without(current), without(next)
	if len(a) != len(b) {
		return denied
	}
	for n := range a {
		if !b[n] {
			return denied
		}
	}
	return nil
}

// profileFields are the columns PATCH /users/profile/me may change.
// The Node service passes req.body straight to prisma.user.update(); only
// the profile fields of the User model are accepted here (password, status,
// email... are ignored instead of being written blindly).
var profileFields = []string{"name", "fullName", "alamat", "kontak", "noHp", "institusi", "programStudi", "prodi", "tempatLahir", "tanggalLahir", "nidn", "nim", "jabatanFungsional", "sintaId", "sintaScore"}

func (s *Server) updateProfile(c *Ctx) error {
	id := c.user.UserID
	ctx := c.r.Context()
	if _, err := s.ensureUserExists(ctx, id); err != nil {
		return err
	}
	body := c.bodyMap()
	sets := []string{}
	args := []any{}
	for _, field := range profileFields {
		value, exists := body[field]
		if !exists {
			continue
		}
		if field == "sintaScore" { // Go saja (W-04): bilangan bulat >= 0, string angka, atau null
			score, err := parseSintaScore(value)
			if err != nil {
				return err
			}
			sets = append(sets, "`sintaScore` = ?")
			args = append(args, score)
			continue
		}
		if field == "tanggalLahir" {
			text, isString := value.(string)
			if value == nil || (isString && text == "") || value == false {
				continue // falsy → undefined → not updated
			}
			if !isString {
				return plainError("Invalid value for argument `tanggalLahir`: Provided Date object is invalid.")
			}
			t, err := parseJSDate(text)
			if err != nil {
				return plainError("Invalid value for argument `tanggalLahir`: Provided Date object is invalid.")
			}
			sets = append(sets, "`tanggalLahir` = ?")
			args = append(args, t)
			continue
		}
		switch v := value.(type) {
		case string:
			args = append(args, v)
		case nil:
			if field == "name" {
				return plainError("Argument `name` must not be null.")
			}
			args = append(args, nil)
		default:
			return plainError(fmt.Sprintf("Invalid value for argument `%s`: Expected String.", field))
		}
		sets = append(sets, "`"+field+"` = ?")
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs(), id)
	if _, err := s.db.ExecContext(ctx, "UPDATE `User` SET "+strings.Join(sets, ", ")+" WHERE `id` = ?", args...); err != nil {
		return err
	}
	user, err := s.profileByID(ctx, id)
	if err != nil {
		return err
	}
	return c.ok("Profile updated", user)
}

var changePasswordSchema = zObj(required("oldPassword", zStr()), required("newPassword", zStr()))

func (s *Server) changePassword(c *Ctx) error {
	out, issues := safeParse(changePasswordSchema, c.body)
	if issues != nil {
		return zodError(issues)
	}
	oldPassword := out["oldPassword"].(string)
	newPassword := out["newPassword"].(string)
	ctx := c.r.Context()
	hash, err := s.ensureUserExists(ctx, c.user.UserID)
	if err != nil {
		return err
	}
	if !passwordMatches(hash, oldPassword) {
		return httpError(http.StatusBadRequest, "Old password is incorrect")
	}
	newHash, err := hashPassword(newPassword, bcryptSaltRounds)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `User` SET `password` = ?, `updatedAt` = ? WHERE `id` = ?", newHash, s.nowMs(), c.user.UserID); err != nil {
		return err
	}
	return c.ok("Password changed successfully", noData)
}

func (s *Server) deleteUser(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	exists, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `User` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	if exists == 0 {
		return notFoundRecord("User")
	}
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `User` WHERE `id` = ?", id); err != nil {
		return err
	}
	return c.ok("User deleted", noData)
}

var searchQuerySchema = zObj(
	zField{name: "q", schema: zStr(), optional: true, emptyIsUndef: true},
	zField{name: "role", schema: zEnumOf(roleNames...), optional: true, emptyIsUndef: true},
	withDefault("limit", zNum().Coerce().Int().Positive(), float64(50)),
)

func (s *Server) searchUsers(c *Ctx) error {
	out, issues := safeParse(searchQuerySchema, queryAsAny(c.query))
	if issues != nil {
		return zodError(issues)
	}
	q, _ := out["q"].(string)
	role, _ := out["role"].(string)
	limit := int64(math.Min(out["limit"].(float64), 200))

	args := []any{"approved"}
	roleClause := "r.`name` IN ('dosen','mahasiswa')"
	if role != "" {
		roleClause = "r.`name` = ?"
		args = append(args, role)
	}
	where := "u.`status` = ? AND EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND " + roleClause + ")"
	if q != "" {
		where += " AND (u.`name` LIKE ? OR u.`email` LIKE ? OR u.`fullName` LIKE ? OR u.`nidn` LIKE ? OR u.`nim` LIKE ?)"
		like := "%" + q + "%"
		args = append(args, like, like, like, like, like)
	}
	ctx := c.r.Context()
	users, err := queryObjs(ctx, s.db,
		"SELECT u.`id`,u.`name`,u.`fullName`,u.`email`,u.`programStudi`,u.`prodi`,u.`nim`,u.`nidn`,u.`kontak`,u.`noHp` FROM `User` u WHERE "+where+" ORDER BY u.`name` ASC LIMIT ?",
		append(args, limit)...)
	if err != nil {
		return err
	}
	if err := attachUserRoles(ctx, s.db, users, "id"); err != nil {
		return err
	}
	return c.ok("Users found", users)
}
