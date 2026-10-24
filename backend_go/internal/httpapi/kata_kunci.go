package httpapi

import (
	"encoding/json"
	"strings"
)

// Kata kunci proposal (W-24): API memakai array string, disimpan sebagai
// JSON di kolom TEXT `kataKunci`. Maks 10 kata kunci, masing-masing 1–50
// karakter; spasi dipangkas, kosong dibuang, duplikat (abaikan huruf besar)
// digabung. [] mengosongkan.

const (
	maxKataKunci        = 10
	maxPanjangKataKunci = 50
)

type zKataKunci struct{}

func (zKataKunci) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	list, ok := value.([]any)
	if !ok || !present {
		invalidType(issues, path, "array", value, present)
		return nil, zAborted
	}
	out := []any{}
	seen := map[string]bool{}
	for _, item := range list {
		text, isText := item.(string)
		if !isText {
			*issues = append(*issues, zIssue{code: "invalid_type", path: path, message: "Kata kunci harus berupa teks"})
			return nil, zDirty
		}
		text = strings.TrimSpace(text)
		if text == "" || seen[strings.ToLower(text)] {
			continue
		}
		if jsLength(text) > maxPanjangKataKunci {
			*issues = append(*issues, zIssue{code: "too_big", path: path, message: "Setiap kata kunci maksimal 50 karakter"})
			return nil, zDirty
		}
		seen[strings.ToLower(text)] = true
		out = append(out, text)
	}
	if len(out) > maxKataKunci {
		*issues = append(*issues, zIssue{code: "too_big", path: path, message: "Kata kunci maksimal 10"})
		return nil, zDirty
	}
	return out, zValid
}

// encodeKataKunci turns the validated list into the stored JSON text
// (NULL for an empty list).
func encodeKataKunci(v any) any {
	list, _ := v.([]any)
	if len(list) == 0 {
		return nil
	}
	raw, _ := json.Marshal(list)
	return string(raw)
}

// decodeKataKunci replaces the stored JSON text with an array (always an
// array in responses, [] when empty).
func decodeKataKunci(items []O) {
	for i := range items {
		if !items[i].Has("kataKunci") {
			continue
		}
		list := []any{}
		if text, ok := items[i].Get("kataKunci").(string); ok && text != "" {
			var decoded []any
			if json.Unmarshal([]byte(text), &decoded) == nil {
				list = decoded
			}
		}
		items[i].Set("kataKunci", list)
	}
}
