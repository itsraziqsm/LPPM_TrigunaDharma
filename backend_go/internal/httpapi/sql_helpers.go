package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

func queryMaps(r *http.Request, db *sql.DB, query string, args ...any) ([]map[string]any, error) {
	rows, err := db.QueryContext(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		destinations := make([]any, len(columns))
		for i := range values {
			destinations[i] = &values[i]
		}
		if err := rows.Scan(destinations...); err != nil {
			return nil, err
		}
		item := make(map[string]any, len(columns))
		for i, column := range columns {
			if value, ok := values[i].([]byte); ok {
				text := string(value)
				var decoded any
				if len(text) > 0 && (text[0] == '{' || text[0] == '[') && json.Unmarshal(value, &decoded) == nil {
					item[column] = decoded
				} else {
					item[column] = text
				}
			} else {
				item[column] = values[i]
			}
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func queryOneMap(r *http.Request, db *sql.DB, query string, args ...any) (map[string]any, error) {
	items, err := queryMaps(r, db, query, args...)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}
	return items[0], nil
}
