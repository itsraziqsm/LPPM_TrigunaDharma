package httpapi

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// tokenPayload is the JWT payload used by the Node backend
// ({userId, email, roles} + iat/exp added by jsonwebtoken). Tokens are
// interchangeable between the Node and Go servers when they share secrets.
type tokenPayload struct {
	UserID int64    `json:"userId"`
	Email  string   `json:"email"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

var msPattern = regexp.MustCompile(`(?i)^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$`)

// msDuration mirrors the `ms` package used by jsonwebtoken for expiresIn.
func msDuration(value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	m := msPattern.FindStringSubmatch(value)
	if m == nil {
		return 0, fmt.Errorf(`"expiresIn" should be a number of seconds or string representing a timespan`)
	}
	n, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0, err
	}
	unit := strings.ToLower(m[2])
	var factor float64
	switch {
	case unit == "" || strings.HasPrefix(unit, "ms") || strings.HasPrefix(unit, "msec") || strings.HasPrefix(unit, "millisecond"):
		factor = 1
	case unit == "s" || strings.HasPrefix(unit, "sec"):
		factor = 1000
	case unit == "m" || strings.HasPrefix(unit, "min"):
		factor = 60 * 1000
	case unit == "h" || strings.HasPrefix(unit, "h"):
		factor = 3600 * 1000
	case unit == "d" || strings.HasPrefix(unit, "day"):
		factor = 86400 * 1000
	case unit == "w" || strings.HasPrefix(unit, "week"):
		factor = 7 * 86400 * 1000
	case unit == "y" || strings.HasPrefix(unit, "y"):
		factor = 365.25 * 86400 * 1000
	}
	return time.Duration(n*factor) * time.Millisecond, nil
}

func (s *Server) signToken(userID int64, email string, roles []string, secret, expiresIn string) (string, error) {
	duration, err := msDuration(expiresIn)
	if err != nil {
		return "", err
	}
	iat := s.now().Unix()
	exp := int64(math.Floor(float64(iat) + duration.Seconds()))
	if roles == nil {
		roles = []string{}
	}
	claims := tokenPayload{
		UserID: userID, Email: email, Roles: roles,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Unix(iat, 0)),
			ExpiresAt: jwt.NewNumericDate(time.Unix(exp, 0)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// verifyToken mirrors jwt.verify(token, secret) and its error messages.
func (s *Server) verifyToken(token, secret string) (*tokenPayload, error) {
	claims := &tokenPayload{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid algorithm")
		}
		return []byte(secret), nil
	}, jwt.WithTimeFunc(s.now))
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			return nil, plainError("jwt expired")
		case errors.Is(err, jwt.ErrTokenSignatureInvalid):
			return nil, plainError("invalid signature")
		case errors.Is(err, jwt.ErrTokenMalformed):
			return nil, plainError("jwt malformed")
		case errors.Is(err, jwt.ErrTokenNotValidYet):
			return nil, plainError("jwt not active")
		default:
			return nil, plainError("invalid token")
		}
	}
	return claims, nil
}

// authenticate mirrors auth.middleware.ts#authenticate.
func (s *Server) authenticate(c *Ctx) error {
	header := c.r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return c.fail(http.StatusUnauthorized, "Unauthorized")
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if token == "" {
		return c.fail(http.StatusUnauthorized, "Unauthorized")
	}
	claims, err := s.verifyToken(token, s.cfg.JWTAccessSecret)
	if err != nil {
		return c.fail(http.StatusUnauthorized, "Token invalid or expired")
	}
	c.user = claims
	s.logger.Printf(`{"type":"auth_access","userId":%d,"email":%q,"method":%q,"path":%q,"ip":%q,"userAgent":%q}`,
		claims.UserID, claims.Email, c.r.Method, c.r.URL.RequestURI(), c.ip, c.ua)
	return nil
}

// authorize mirrors auth.middleware.ts#authorize(...roles).
func authorize(roles ...string) step {
	return func(c *Ctx) error {
		if c.user == nil {
			return c.fail(http.StatusUnauthorized, "Unauthorized")
		}
		if !hasAnyRole(c.user.Roles, roles...) {
			return c.fail(http.StatusForbidden, "Forbidden: insufficient permissions")
		}
		return nil
	}
}

func hasAnyRole(userRoles []string, roles ...string) bool {
	for _, have := range userRoles {
		for _, want := range roles {
			if have == want {
				return true
			}
		}
	}
	return false
}

func contains(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}
