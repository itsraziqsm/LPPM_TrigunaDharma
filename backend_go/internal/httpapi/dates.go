package httpapi

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	isoDateOnly  = regexp.MustCompile(`^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$`)
	isoDateTime  = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$`)
	errBadJSDate = errors.New("invalid date")
)

// parseJSDate approximates `new Date(value)` for the formats clients send:
// ISO 8601 date-only strings are UTC, date-times without an offset are
// local time, date-times with Z/offset are absolute.
func parseJSDate(value string) (time.Time, error) {
	s := strings.TrimSpace(value)
	if s == "" {
		return time.Time{}, errBadJSDate
	}
	if m := isoDateOnly.FindStringSubmatch(s); m != nil {
		year, _ := strconv.Atoi(m[1])
		month, day := 1, 1
		if m[2] != "" {
			month, _ = strconv.Atoi(m[2])
		}
		if m[3] != "" {
			day, _ = strconv.Atoi(m[3])
		}
		if month < 1 || month > 12 || day < 1 || day > daysIn(year, month) {
			return time.Time{}, errBadJSDate
		}
		return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC), nil
	}
	if m := isoDateTime.FindStringSubmatch(s); m != nil {
		year, _ := strconv.Atoi(m[1])
		month, _ := strconv.Atoi(m[2])
		day, _ := strconv.Atoi(m[3])
		hour, _ := strconv.Atoi(m[4])
		minute, _ := strconv.Atoi(m[5])
		sec := 0
		if m[6] != "" {
			sec, _ = strconv.Atoi(m[6])
		}
		ms := 0
		if m[7] != "" {
			frac := (m[7] + "000")[:3]
			ms, _ = strconv.Atoi(frac)
		}
		if month < 1 || month > 12 || day < 1 || day > daysIn(year, month) || hour > 24 || minute > 59 || sec > 59 {
			return time.Time{}, errBadJSDate
		}
		loc := time.Local
		if zone := m[8]; zone != "" {
			if zone == "Z" {
				loc = time.UTC
			} else {
				sign := 1
				if zone[0] == '-' {
					sign = -1
				}
				digits := strings.ReplaceAll(zone[1:], ":", "")
				hh, _ := strconv.Atoi(digits[:2])
				mm := 0
				if len(digits) >= 4 {
					mm, _ = strconv.Atoi(digits[2:4])
				}
				loc = time.FixedZone("", sign*(hh*3600+mm*60))
			}
		}
		return time.Date(year, time.Month(month), day, hour, minute, sec, ms*int(time.Millisecond), loc).UTC(), nil
	}
	for _, layout := range []string{time.RFC1123, time.RFC1123Z, time.RFC850, time.ANSIC, "Jan 2 2006", "January 2 2006", "2 Jan 2006", "2006/01/02", "01/02/2006"} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, errBadJSDate
}

// coerceJSDate mirrors z.coerce.date(): new Date(input).
func coerceJSDate(value any, present bool) (time.Time, bool) {
	if !present {
		return time.Time{}, false
	}
	switch v := value.(type) {
	case nil:
		return time.UnixMilli(0).UTC(), true
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return time.Time{}, false
		}
		return time.UnixMilli(int64(v)).UTC(), true
	case bool:
		if v {
			return time.UnixMilli(1).UTC(), true
		}
		return time.UnixMilli(0).UTC(), true
	case string:
		t, err := parseJSDate(v)
		return t, err == nil
	}
	return time.Time{}, false
}

func daysIn(year, month int) int {
	return time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// formatIDDate mirrors Date#toLocaleDateString("id-ID") (d/m/yyyy, local).
func formatIDDate(t time.Time) string {
	l := t.Local()
	return strconv.Itoa(l.Day()) + "/" + strconv.Itoa(int(l.Month())) + "/" + strconv.Itoa(l.Year())
}

// formatIDNumber mirrors Number#toLocaleString("id-ID"): "." thousands
// separator, "," decimal separator, at most 3 fraction digits.
func formatIDNumber(f float64) string {
	neg := f < 0
	if neg {
		f = -f
	}
	text := strconv.FormatFloat(math.Round(f*1000)/1000, 'f', 3, 64)
	intPart, frac, _ := strings.Cut(text, ".")
	frac = strings.TrimRight(frac, "0")
	var grouped strings.Builder
	for i, d := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			grouped.WriteByte('.')
		}
		grouped.WriteRune(d)
	}
	out := grouped.String()
	if frac != "" {
		out += "," + frac
	}
	if neg && out != "0" {
		out = "-" + out
	}
	return out
}
