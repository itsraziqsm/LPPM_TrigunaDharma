package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// dbtx is satisfied by *sql.DB and *sql.Tx.
type dbtx interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// queryObjs runs a query and converts each row into an ordered object whose
// values are typed like Prisma's output: BOOLEAN → bool, DATETIME → JSTime,
// DECIMAL → Decimal, BLOB → Bytes, INT → int64, text → string.
// Columns whose alias starts with "__" are kept for internal use (relation
// keys) and must be stripped by the caller with stripInternal.
func queryObjs(ctx context.Context, q dbtx, query string, args ...any) ([]O, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}
	result := make([]O, 0)
	for rows.Next() {
		raw := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range raw {
			ptrs[i] = &raw[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		obj := make(O, 0, len(cols))
		for i, col := range cols {
			obj = append(obj, KV{col.Name(), convertValue(col.DatabaseTypeName(), raw[i])})
		}
		result = append(result, obj)
	}
	return result, rows.Err()
}

func queryObj(ctx context.Context, q dbtx, query string, args ...any) (O, error) {
	items, err := queryObjs(ctx, q, query, args...)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}
	return items[0], nil
}

func convertValue(dbType string, value any) any {
	if value == nil {
		return nil
	}
	dbType = strings.ToUpper(dbType)
	switch {
	case dbType == "TINYINT" || dbType == "BOOL" || dbType == "BOOLEAN" || dbType == "BIT":
		switch v := value.(type) {
		case int64:
			return v != 0
		case []byte:
			return len(v) > 0 && v[0] != '0' && v[0] != 0
		}
	case dbType == "DECIMAL" || dbType == "NEWDECIMAL":
		switch v := value.(type) {
		case []byte:
			return Decimal(string(v))
		case string:
			return Decimal(v)
		case float64:
			return Decimal(fmt.Sprint(v))
		}
	case strings.Contains(dbType, "DATE") || strings.Contains(dbType, "TIMESTAMP"):
		if t, ok := value.(time.Time); ok {
			return JSTime(t)
		}
	case strings.Contains(dbType, "BLOB") || strings.Contains(dbType, "BINARY"):
		if b, ok := value.([]byte); ok {
			return Bytes(append([]byte(nil), b...))
		}
	}
	switch v := value.(type) {
	case []byte:
		return string(v)
	case int32:
		return int64(v)
	case uint64:
		return int64(v)
	}
	return value
}

func stripInternal(items []O) {
	for i := range items {
		kept := items[i][:0]
		for _, kv := range items[i] {
			if !strings.HasPrefix(kv.K, "__") {
				kept = append(kept, kv)
			}
		}
		items[i] = kept
	}
}

func placeholders(n int) string {
	if n <= 0 {
		return "NULL"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func idArgs(ids []int64) []any {
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return args
}

func uniqueIDs(items []O, key string) []int64 {
	seen := map[int64]bool{}
	ids := make([]int64, 0, len(items))
	for _, item := range items {
		v, ok := item.Get(key).(int64)
		if !ok || seen[v] {
			continue
		}
		seen[v] = true
		ids = append(ids, v)
	}
	return ids
}

// attachOne loads a to-one relation: for each item, item[key] =
// row whose __k equals item[fk] (or nil). The query must contain one %s
// for the IN list and select the join key as __k.
func attachOne(ctx context.Context, q dbtx, items []O, fk, key, query string, extraArgs ...any) error {
	ids := uniqueIDs(items, fk)
	byID := map[int64]O{}
	if len(ids) > 0 {
		rows, err := queryObjs(ctx, q, fmt.Sprintf(query, placeholders(len(ids))), append(idArgs(ids), extraArgs...)...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			k := row.Int64("__k")
			clean := []O{row}
			stripInternal(clean)
			byID[k] = clean[0]
		}
	}
	for i := range items {
		var value any
		if id, ok := items[i].Get(fk).(int64); ok {
			if row, found := byID[id]; found {
				value = row
			}
		}
		items[i].Set(key, value)
	}
	return nil
}

// attachMany loads a to-many relation: item[key] = rows whose __k equals
// item[pk]. The query must contain one %s for the IN list, select the
// parent key as __k and define its own ORDER BY.
func attachMany(ctx context.Context, q dbtx, items []O, pk, key, query string) (map[int64][]O, error) {
	ids := uniqueIDs(items, pk)
	grouped := map[int64][]O{}
	if len(ids) > 0 {
		rows, err := queryObjs(ctx, q, fmt.Sprintf(query, placeholders(len(ids))), idArgs(ids)...)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			k := row.Int64("__k")
			grouped[k] = append(grouped[k], row)
		}
		for k := range grouped {
			stripInternal(grouped[k])
		}
	}
	for i := range items {
		id, _ := items[i].Get(pk).(int64)
		list := grouped[id]
		if list == nil {
			list = []O{}
		}
		items[i].Set(key, list)
	}
	return grouped, nil
}

// nestUser moves the columns prefixed with prefix (e.g. "u_") into a nested
// object stored under key; when the nested id is NULL the value is null.
func nestColumns(items []O, prefix, key string) {
	for i := range items {
		nested := O{}
		kept := make(O, 0, len(items[i]))
		insertAt := -1
		for _, kv := range items[i] {
			if strings.HasPrefix(kv.K, prefix) {
				if insertAt < 0 {
					insertAt = len(kept)
				}
				nested = append(nested, KV{strings.TrimPrefix(kv.K, prefix), kv.V})
				continue
			}
			kept = append(kept, kv)
		}
		var value any = nested
		if nested.Get("id") == nil && nested.Has("id") {
			value = nil
		}
		if insertAt < 0 {
			kept = append(kept, KV{key, value})
		} else {
			kept = append(kept[:insertAt], append(O{{key, value}}, kept[insertAt:]...)...)
		}
		items[i] = kept
	}
}

func (s *Server) withTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func countRows(ctx context.Context, q dbtx, query string, args ...any) (int64, error) {
	var n int64
	err := q.QueryRowContext(ctx, query, args...).Scan(&n)
	return n, err
}

// nullable converts Go zero-ish optional values into SQL NULL.
func optString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
