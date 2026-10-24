package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// O is an ordered JSON object. Prisma (and therefore the Node backend)
// returns object keys in a stable order (select/include order), so responses
// are built with O instead of map[string]any to keep the same key order.
type O []KV

// KV is a single key/value pair in an ordered object.
type KV struct {
	K string
	V any
}

// Get returns the value stored under key, or nil.
func (o O) Get(key string) any {
	for _, kv := range o {
		if kv.K == key {
			return kv.V
		}
	}
	return nil
}

// Has reports whether key exists.
func (o O) Has(key string) bool {
	for _, kv := range o {
		if kv.K == key {
			return true
		}
	}
	return false
}

// Set replaces the value for key (keeping its position) or appends it.
func (o *O) Set(key string, value any) {
	for i := range *o {
		if (*o)[i].K == key {
			(*o)[i].V = value
			return
		}
	}
	*o = append(*o, KV{key, value})
}

// Del removes key if present.
func (o *O) Del(key string) {
	for i := range *o {
		if (*o)[i].K == key {
			*o = append((*o)[:i], (*o)[i+1:]...)
			return
		}
	}
}

// Int64 returns the integer value stored under key.
func (o O) Int64(key string) int64 {
	switch v := o.Get(key).(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case float64:
		return int64(v)
	}
	return 0
}

// Str returns the string value stored under key ("" when null).
func (o O) Str(key string) string {
	if s, ok := o.Get(key).(string); ok {
		return s
	}
	return ""
}

// MarshalJSON encodes the object preserving key order.
func (o O) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	if err := writeJSON(&buf, o); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// JSTime serialises like a JavaScript Date in JSON: ISO 8601, UTC, millis.
type JSTime time.Time

// Decimal holds a MySQL DECIMAL value; it serialises like Prisma's
// Decimal.js (a string without trailing zeros, e.g. "1500000").
type Decimal string

// Bytes holds a BLOB value. Prisma 6+/7 returns Bytes fields as Uint8Array,
// which JSON.stringify renders as {"0":37,"1":80,...}; Bytes reproduces it.
type Bytes []byte

func formatJSTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// normalizeDecimal mimics Decimal.js#toString for values coming from MySQL.
func normalizeDecimal(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "0"
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(strings.TrimPrefix(s, "-"), "+")
	intPart, frac, hasFrac := strings.Cut(s, ".")
	if hasFrac {
		frac = strings.TrimRight(frac, "0")
	}
	intPart = strings.TrimLeft(intPart, "0")
	if intPart == "" {
		intPart = "0"
	}
	out := intPart
	if frac != "" {
		out += "." + frac
	}
	if out == "0" {
		return "0"
	}
	if neg {
		out = "-" + out
	}
	return out
}

func writeJSONString(buf *bytes.Buffer, s string) error {
	enc := json.NewEncoder(buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return err
	}
	// json.Encoder appends a newline.
	buf.Truncate(buf.Len() - 1)
	return nil
}

// jsNumber formats a float64 the way JavaScript's Number#toString does for
// the ranges used by this API.
func jsNumber(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}
	if f == math.Trunc(f) && math.Abs(f) < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return strconv.FormatFloat(f, 'g', -1, 64)
}

func writeJSON(buf *bytes.Buffer, value any) error {
	switch v := value.(type) {
	case nil:
		buf.WriteString("null")
	case O:
		buf.WriteByte('{')
		for i, kv := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSONString(buf, kv.K); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := writeJSON(buf, kv.V); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	case []O:
		buf.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSON(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case []any:
		buf.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSON(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case []string:
		buf.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSONString(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case string:
		return writeJSONString(buf, v)
	case bool:
		if v {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case int:
		buf.WriteString(strconv.Itoa(v))
	case int64:
		buf.WriteString(strconv.FormatInt(v, 10))
	case int32:
		buf.WriteString(strconv.FormatInt(int64(v), 10))
	case uint64:
		buf.WriteString(strconv.FormatUint(v, 10))
	case float64:
		buf.WriteString(jsNumber(v))
	case JSTime:
		buf.WriteByte('"')
		buf.WriteString(formatJSTime(time.Time(v)))
		buf.WriteByte('"')
	case time.Time:
		buf.WriteByte('"')
		buf.WriteString(formatJSTime(v))
		buf.WriteByte('"')
	case *time.Time:
		if v == nil {
			buf.WriteString("null")
		} else {
			buf.WriteByte('"')
			buf.WriteString(formatJSTime(*v))
			buf.WriteByte('"')
		}
	case Decimal:
		return writeJSONString(buf, normalizeDecimal(string(v)))
	case Bytes:
		buf.WriteByte('{')
		for i, b := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			buf.WriteByte('"')
			buf.WriteString(strconv.Itoa(i))
			buf.WriteString(`":`)
			buf.WriteString(strconv.Itoa(int(b)))
		}
		buf.WriteByte('}')
	case json.RawMessage:
		buf.Write(v)
	case map[string]any:
		// Only used for small ad-hoc payloads; keys are written sorted.
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sortStrings(keys)
		o := make(O, 0, len(v))
		for _, k := range keys {
			o = append(o, KV{k, v[k]})
		}
		return writeJSON(buf, o)
	default:
		data, err := json.Marshal(v)
		if err != nil {
			return fmt.Errorf("encode %T: %w", v, err)
		}
		buf.Write(data)
	}
	return nil
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

// encodeJSON renders a value with JSON.stringify semantics (no trailing
// newline, no HTML escaping).
func encodeJSON(value any) ([]byte, error) {
	var buf bytes.Buffer
	if err := writeJSON(&buf, value); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
