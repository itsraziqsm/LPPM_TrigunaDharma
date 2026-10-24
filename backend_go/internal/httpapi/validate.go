package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

// This file reproduces the subset of zod v3 used by the Node backend, with
// the same error messages, so that 422 "Validation error" bodies (zod's
// flatten().fieldErrors) and thrown ZodErrors match.

type zIssue struct {
	code    string
	path    []any
	message string
	extra   O // extra properties shown in ZodError#message
}

const (
	zValid = iota
	zDirty
	zAborted
)

type zSchema interface {
	parse(value any, present bool, path []any, issues *[]zIssue) (any, int)
}

func pathWith(path []any, p any) []any {
	out := make([]any, len(path), len(path)+1)
	copy(out, path)
	return append(out, p)
}

// jsTypeOf mirrors zod's getParsedType.
func jsTypeOf(value any, present bool) string {
	if !present {
		return "undefined"
	}
	switch v := value.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case float64:
		if math.IsNaN(v) {
			return "nan"
		}
		return "number"
	case int, int64:
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	}
	return "unknown"
}

func invalidType(issues *[]zIssue, path []any, expected string, value any, present bool) {
	received := jsTypeOf(value, present)
	message := "Expected " + expected + ", received " + received
	if received == "undefined" {
		message = "Required"
	}
	*issues = append(*issues, zIssue{
		code: "invalid_type", path: path, message: message,
		extra: O{{"expected", expected}, {"received", received}},
	})
}

// ── string ────────────────────────────────────────────────────────────────

type zString struct {
	trim     bool
	min      int // -1: no check
	minMsg   string
	email    bool
	url      bool
	urlMsg   string
	datetime bool
	offset   bool
	date     bool
}

func zStr() *zString { return &zString{min: -1} }

func (z *zString) Min(n int, msg string) *zString { z.min, z.minMsg = n, msg; return z }
func (z *zString) Trim() *zString                 { z.trim = true; return z }
func (z *zString) Email() *zString                { z.email = true; return z }
func (z *zString) URL(msg string) *zString        { z.url, z.urlMsg = true, msg; return z }
func (z *zString) Datetime(offset bool) *zString  { z.datetime, z.offset = true, offset; return z }
func (z *zString) Date() *zString                 { z.date = true; return z }

func jsLength(s string) int { return len(utf16.Encode([]rune(s))) }

var (
	zEmailRe   = regexp.MustCompile(`(?i)^(?:[A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@(?:[A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$`)
	zDateSrc   = `(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))`
	zTimeSrc   = `(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?`
	zDateRe    = regexp.MustCompile(`^` + zDateSrc + `$`)
	zDTRe      = regexp.MustCompile(`^` + zDateSrc + `T` + zTimeSrc + `Z$`)
	zDTOffRe   = regexp.MustCompile(`^` + zDateSrc + `T` + zTimeSrc + `(?:Z|[+-]\d{2}(?::?\d{2})?)$`)
	zURLScheme = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.\-]*:`)
)

func validEmail(s string) bool {
	if strings.HasPrefix(s, ".") || strings.Contains(s, "..") {
		return false
	}
	return zEmailRe.MatchString(s)
}

// validURL approximates `new URL(value)` (what zod's .url() uses).
func validURL(s string) bool {
	if !zURLScheme.MatchString(s) {
		return false
	}
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https", "ws", "wss", "ftp":
		return u.Host != ""
	}
	return true
}

func (z *zString) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	s, ok := value.(string)
	if !ok || !present {
		invalidType(issues, path, "string", value, present)
		return nil, zAborted
	}
	if z.trim {
		s = strings.TrimSpace(s)
	}
	status := zValid
	if z.min >= 0 && jsLength(s) < z.min {
		msg := z.minMsg
		if msg == "" {
			msg = fmt.Sprintf("String must contain at least %d character(s)", z.min)
		}
		*issues = append(*issues, zIssue{code: "too_small", path: path, message: msg,
			extra: O{{"minimum", z.min}, {"type", "string"}, {"inclusive", true}, {"exact", false}}})
		status = zDirty
	}
	if z.email && !validEmail(s) {
		*issues = append(*issues, zIssue{code: "invalid_string", path: path, message: "Invalid email", extra: O{{"validation", "email"}}})
		status = zDirty
	}
	if z.url && !validURL(s) {
		msg := z.urlMsg
		if msg == "" {
			msg = "Invalid url"
		}
		*issues = append(*issues, zIssue{code: "invalid_string", path: path, message: msg, extra: O{{"validation", "url"}}})
		status = zDirty
	}
	if z.datetime {
		re := zDTRe
		if z.offset {
			re = zDTOffRe
		}
		if !re.MatchString(s) {
			*issues = append(*issues, zIssue{code: "invalid_string", path: path, message: "Invalid datetime", extra: O{{"validation", "datetime"}}})
			status = zDirty
		}
	}
	if z.date && !zDateRe.MatchString(s) {
		*issues = append(*issues, zIssue{code: "invalid_string", path: path, message: "Invalid date", extra: O{{"validation", "date"}}})
		status = zDirty
	}
	return s, status
}

// ── union (string datetime | string date) ─────────────────────────────────

type zUnion struct{ options []zSchema }

func (z *zUnion) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	var dirtyIssues []zIssue
	var dirtyValue any
	haveDirty := false
	for _, opt := range z.options {
		var local []zIssue
		out, status := opt.parse(value, present, path, &local)
		if status == zValid {
			return out, zValid
		}
		if status == zDirty && !haveDirty {
			haveDirty, dirtyIssues, dirtyValue = true, local, out
		}
	}
	if haveDirty {
		*issues = append(*issues, dirtyIssues...)
		return dirtyValue, zDirty
	}
	*issues = append(*issues, zIssue{code: "invalid_union", path: path, message: "Invalid input"})
	return nil, zAborted
}

// ── number ────────────────────────────────────────────────────────────────

type zNumber struct {
	coerce   bool
	isInt    bool
	positive bool
	nonneg   bool
	min, max *float64
}

func zNum() *zNumber                      { return &zNumber{} }
func (z *zNumber) Coerce() *zNumber       { z.coerce = true; return z }
func (z *zNumber) Int() *zNumber          { z.isInt = true; return z }
func (z *zNumber) Positive() *zNumber     { z.positive = true; return z }
func (z *zNumber) NonNegative() *zNumber  { z.nonneg = true; return z }
func (z *zNumber) Min(v float64) *zNumber { z.min = &v; return z }
func (z *zNumber) Max(v float64) *zNumber { z.max = &v; return z }

func (z *zNumber) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	if z.coerce {
		if !present {
			value, present = math.NaN(), true
		} else {
			value = jsToNumber(value)
		}
	}
	f, ok := value.(float64)
	if !ok || !present || math.IsNaN(f) {
		invalidType(issues, path, "number", value, present)
		return nil, zAborted
	}
	status := zValid
	if z.isInt && f != math.Trunc(f) {
		*issues = append(*issues, zIssue{code: "invalid_type", path: path, message: "Expected integer, received float",
			extra: O{{"expected", "integer"}, {"received", "float"}}})
		status = zDirty
	}
	tooSmall := func(min float64, inclusive bool) {
		msg := "Number must be greater than " + jsNumber(min)
		if inclusive {
			msg = "Number must be greater than or equal to " + jsNumber(min)
		}
		*issues = append(*issues, zIssue{code: "too_small", path: path, message: msg,
			extra: O{{"minimum", min}, {"type", "number"}, {"inclusive", inclusive}, {"exact", false}}})
		status = zDirty
	}
	if z.positive && !(f > 0) {
		tooSmall(0, false)
	}
	if z.nonneg && f < 0 {
		tooSmall(0, true)
	}
	if z.min != nil && f < *z.min {
		tooSmall(*z.min, true)
	}
	if z.max != nil && f > *z.max {
		*issues = append(*issues, zIssue{code: "too_big", path: path, message: "Number must be less than or equal to " + jsNumber(*z.max),
			extra: O{{"maximum", *z.max}, {"type", "number"}, {"inclusive", true}, {"exact", false}}})
		status = zDirty
	}
	return f, status
}

// jsToNumber mirrors JavaScript's Number(value).
func jsToNumber(value any) any {
	switch v := value.(type) {
	case nil:
		return float64(0)
	case bool:
		if v {
			return float64(1)
		}
		return float64(0)
	case float64:
		return v
	case string:
		return jsStringToNumber(v)
	case []any:
		parts := make([]string, len(v))
		for i, item := range v {
			if item == nil {
				continue
			}
			parts[i] = fmt.Sprint(item)
		}
		return jsStringToNumber(strings.Join(parts, ","))
	}
	return math.NaN()
}

func jsStringToNumber(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	lower := strings.ToLower(s)
	for _, p := range []struct {
		prefix string
		base   int
	}{{"0x", 16}, {"0b", 2}, {"0o", 8}} {
		if strings.HasPrefix(lower, p.prefix) {
			n, err := strconv.ParseUint(s[2:], p.base, 64)
			if err != nil {
				return math.NaN()
			}
			return float64(n)
		}
	}
	switch s {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if strings.ContainsAny(lower, "xn_") || strings.HasPrefix(lower, "+-") || strings.HasPrefix(lower, "-+") {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return math.NaN()
	}
	return f
}

// ── boolean / enum ───────────────────────────────────────────────────────

type zBoolean struct{}

func (zBoolean) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	b, ok := value.(bool)
	if !ok || !present {
		invalidType(issues, path, "boolean", value, present)
		return nil, zAborted
	}
	return b, zValid
}

type zEnum struct{ values []string }

func zEnumOf(values ...string) *zEnum { return &zEnum{values: values} }

func (z *zEnum) expected() string {
	quoted := make([]string, len(z.values))
	for i, v := range z.values {
		quoted[i] = "'" + v + "'"
	}
	return strings.Join(quoted, " | ")
}

func (z *zEnum) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	s, ok := value.(string)
	if !ok || !present {
		invalidType(issues, path, z.expected(), value, present)
		return nil, zAborted
	}
	for _, v := range z.values {
		if v == s {
			return s, zValid
		}
	}
	*issues = append(*issues, zIssue{code: "invalid_enum_value", path: path,
		message: "Invalid enum value. Expected " + z.expected() + ", received '" + s + "'",
		extra:   O{{"received", s}, {"options", z.values}}})
	return nil, zAborted
}

// ── array / object ───────────────────────────────────────────────────────

type zArray struct {
	elem   zSchema
	min    int
	minMsg string
}

func (z *zArray) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	list, ok := value.([]any)
	if !ok || !present {
		invalidType(issues, path, "array", value, present)
		return nil, zAborted
	}
	status := zValid
	if z.min > 0 && len(list) < z.min {
		msg := z.minMsg
		if msg == "" {
			msg = fmt.Sprintf("Array must contain at least %d element(s)", z.min)
		}
		*issues = append(*issues, zIssue{code: "too_small", path: path, message: msg,
			extra: O{{"minimum", z.min}, {"type", "array"}, {"inclusive", true}, {"exact", false}}})
		status = zDirty
	}
	out := make([]any, len(list))
	for i, item := range list {
		v, st := z.elem.parse(item, true, pathWith(path, i), issues)
		if st > status {
			status = st
		}
		out[i] = v
	}
	return out, status
}

type zField struct {
	name         string
	schema       zSchema
	optional     bool
	hasDefault   bool
	def          any
	emptyIsUndef bool // z.preprocess(v => v === "" ? undefined : v, ...)
}

type zObject struct{ fields []zField }

func zObj(fields ...zField) *zObject { return &zObject{fields: fields} }

func required(name string, schema zSchema) zField { return zField{name: name, schema: schema} }
func optional(name string, schema zSchema) zField {
	return zField{name: name, schema: schema, optional: true}
}
func withDefault(name string, schema zSchema, def any) zField {
	return zField{name: name, schema: schema, hasDefault: true, def: def}
}

// partial mirrors schema.partial().
func (z *zObject) partial() *zObject {
	out := &zObject{fields: make([]zField, len(z.fields))}
	for i, f := range z.fields {
		f.optional = true
		out.fields[i] = f
	}
	return out
}

func (z *zObject) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	m, ok := value.(map[string]any)
	if !ok || !present {
		invalidType(issues, path, "object", value, present)
		return nil, zAborted
	}
	out := map[string]any{}
	status := zValid
	for _, f := range z.fields {
		v, exists := m[f.name]
		if f.emptyIsUndef && exists {
			if s, isStr := v.(string); isStr && s == "" {
				exists = false
			}
		}
		if !exists {
			if f.hasDefault {
				v, exists = f.def, true
			} else if f.optional {
				continue
			}
		}
		parsed, st := f.schema.parse(v, exists, pathWith(path, f.name), issues)
		if st > status {
			status = st
		}
		if st != zAborted {
			out[f.name] = parsed
		}
	}
	return out, status
}

// ── helpers ──────────────────────────────────────────────────────────────

// safeParse returns the parsed object (map) and the issues.
func safeParse(schema zSchema, value any) (map[string]any, []zIssue) {
	var issues []zIssue
	out, status := schema.parse(value, true, nil, &issues)
	if status == zValid {
		m, _ := out.(map[string]any)
		return m, nil
	}
	if len(issues) == 0 {
		issues = append(issues, zIssue{code: "custom", message: "Invalid input"})
	}
	return nil, issues
}

// fieldErrors mirrors ZodError#flatten().fieldErrors.
func fieldErrors(issues []zIssue) O {
	out := O{}
	for _, issue := range issues {
		if len(issue.path) == 0 {
			continue
		}
		key := fmt.Sprint(issue.path[0])
		existing, _ := out.Get(key).([]string)
		out.Set(key, append(existing, issue.message))
	}
	return out
}

// zodError builds the error thrown by schema.parse(): Node answers HTTP 500
// with ZodError#message, i.e. JSON.stringify(issues, null, 2).
func zodError(issues []zIssue) error {
	list := make([]O, 0, len(issues))
	for _, issue := range issues {
		item := O{{"code", issue.code}}
		item = append(item, issue.extra...)
		path := issue.path
		if path == nil {
			path = []any{}
		}
		item = append(item, KV{"path", path}, KV{"message", issue.message})
		list = append(list, item)
	}
	raw, _ := encodeJSON(list)
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, raw, "", "  "); err != nil {
		return plainError(string(raw))
	}
	return plainError(pretty.String())
}

// validate mirrors validate(schema, "body"|"query"): on failure answer 422
// with fieldErrors, on success replace the source with the parsed value.
func validateBody(schema zSchema) step {
	return func(c *Ctx) error {
		out, issues := safeParse(schema, c.body)
		if issues != nil {
			c.s.validationFailed(c.w, c.r, fieldErrors(issues))
			return errStop
		}
		c.body = out
		return nil
	}
}

// queryAsAny converts url.Values to the shape produced by Express' query
// parser (single value → string, repeated → array).
func queryAsAny(values url.Values) map[string]any {
	out := map[string]any{}
	for key, list := range values {
		if len(list) == 1 {
			out[key] = list[0]
			continue
		}
		items := make([]any, len(list))
		for i, v := range list {
			items[i] = v
		}
		out[key] = items
	}
	return out
}

func paramsAsAny(params map[string]string) map[string]any {
	out := map[string]any{}
	for k, v := range params {
		out[k] = v
	}
	return out
}

// positiveIntParam mirrors z.object({name: z.coerce.number().int().positive()}).parse(req.params).
func positiveIntParams(c *Ctx, names ...string) (map[string]int64, error) {
	fields := make([]zField, len(names))
	for i, n := range names {
		fields[i] = required(n, zNum().Coerce().Int().Positive())
	}
	out, issues := safeParse(zObj(fields...), paramsAsAny(c.params))
	if issues != nil {
		return nil, zodError(issues)
	}
	result := map[string]int64{}
	for _, n := range names {
		result[n] = int64(out[n].(float64))
	}
	return result, nil
}

// Typed accessors for parsed bodies.

func getString(m map[string]any, key string) (string, bool) {
	v, ok := m[key].(string)
	return v, ok
}

func getFloat(m map[string]any, key string) (float64, bool) {
	v, ok := m[key].(float64)
	return v, ok
}
