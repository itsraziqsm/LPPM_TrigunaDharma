package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// activityEntry mirrors activityLogService.log() input.
type activityEntry struct {
	UserID     int64
	Action     string
	EntityType any // string or nil
	EntityID   any // int64 or nil
	ProposalID any // int64 or nil
	Detail     any // string or nil
}

// logActivity mirrors activityLogService.log: ip/userAgent come from the
// current request (requestContext in Node).
func (s *Server) logActivity(ctx context.Context, q dbtx, c *Ctx, e activityEntry) error {
	var ip, ua any
	if c != nil {
		if c.ip != "" {
			ip = c.ip
		}
		if c.ua != "" {
			ua = c.ua
		}
	}
	_, err := q.ExecContext(ctx,
		"INSERT INTO `ActivityLog` (`userId`,`action`,`entityType`,`entityId`,`detail`,`proposalId`,`ipAddress`,`userAgent`,`createdAt`) VALUES (?,?,?,?,?,?,?,?,?)",
		e.UserID, e.Action, e.EntityType, e.EntityID, e.Detail, e.ProposalID, ip, ua, s.nowMs())
	return err
}

// notification mirrors notificationService.create input.
type notification struct {
	UserID  int64
	Type    string
	Judul   string
	Pesan   string
	RefID   any
	RefType any
}

func (s *Server) createNotification(ctx context.Context, q dbtx, n notification) error {
	_, err := q.ExecContext(ctx,
		"INSERT INTO `Notification` (`userId`,`type`,`judul`,`pesan`,`isRead`,`refId`,`refType`,`createdAt`) VALUES (?,?,?,?,?,?,?,?)",
		n.UserID, n.Type, n.Judul, n.Pesan, false, n.RefID, n.RefType, s.nowMs())
	return err
}

// bcryptjs silently truncates passwords to 72 bytes; Go's bcrypt rejects
// longer input, so truncate first to keep hashes compatible.
func bcryptInput(password string) []byte {
	b := []byte(password)
	if len(b) > 72 {
		b = b[:72]
	}
	return b
}

func hashPassword(password string, cost int) (string, error) {
	hash, err := bcrypt.GenerateFromPassword(bcryptInput(password), cost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func passwordMatches(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), bcryptInput(password)) == nil
}

// jsEncodeURIComponent mirrors JavaScript's encodeURIComponent.
func jsEncodeURIComponent(value string) string {
	const unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
	var b strings.Builder
	for _, by := range []byte(value) {
		if strings.IndexByte(unreserved, by) >= 0 {
			b.WriteByte(by)
			continue
		}
		b.WriteString("%")
		b.WriteString(strings.ToUpper(hex2(by)))
	}
	return b.String()
}

func hex2(b byte) string {
	const digits = "0123456789abcdef"
	return string([]byte{digits[b>>4], digits[b&0x0f]})
}

// jsNumberParam mirrors Number(req.params.x) followed by Prisma's
// validation of an Int argument: NaN or fractional values make Prisma
// throw (HTTP 500 in Node).
func jsNumberParam(raw string, field string) (int64, error) {
	f := jsStringToNumber(raw)
	if math.IsNaN(f) || math.IsInf(f, 0) || f != math.Trunc(f) || math.Abs(f) > math.MaxInt32 {
		return 0, invalidArgument(field, jsNumberText(f))
	}
	return int64(f), nil
}

func jsNumberText(f float64) string {
	if math.IsNaN(f) {
		return "NaN"
	}
	return jsNumber(f)
}

// addDaysLocal mirrors `d.setDate(d.getDate() + n)` (server local time).
func addDaysLocal(t time.Time, days int) time.Time {
	return t.Local().AddDate(0, 0, days)
}

// paginationArgs validates skip/take like Prisma does (Node answers 500 for
// negative skip or non-integer values).
func paginationArgs(page, limit float64) (int64, int64, error) {
	if math.IsNaN(page) || math.IsNaN(limit) || page != math.Trunc(page) || limit != math.Trunc(limit) {
		return 0, 0, plainError("Invalid value for argument `skip` or `take`: expected an integer")
	}
	skip := (page - 1) * limit
	if skip < 0 {
		return 0, 0, plainError("Invalid value for argument `skip`: Value can only be positive, found: " + jsNumber(skip))
	}
	if limit < 0 {
		return 0, 0, plainError("Invalid value for argument `take`: Value can only be positive, found: " + jsNumber(limit))
	}
	return int64(skip), int64(limit), nil
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }
