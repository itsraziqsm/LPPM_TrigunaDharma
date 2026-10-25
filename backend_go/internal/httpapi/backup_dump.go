package httpapi

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// dumpDatabase menulis dump SQL lengkap (struktur + data + VIEW) seperti mysqldump, tanpa
// bergantung pada binary mysqldump. Dibaca dalam satu snapshot konsisten (REPEATABLE READ),
// jadi data yang ditulis selama backup berjalan tidak membuat dump setengah-setengah.
// Pulihkan dengan: gunzip < file.sql.gz | mysql -u <user> -p <database>
func dumpDatabase(ctx context.Context, db *sql.DB, out io.Writer) (tables int, rows int64, err error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ"); err != nil {
		return 0, 0, err
	}
	if _, err := conn.ExecContext(ctx, "START TRANSACTION WITH CONSISTENT SNAPSHOT"); err != nil {
		return 0, 0, err
	}
	defer conn.ExecContext(context.Background(), "COMMIT") //nolint:errcheck // read-only snapshot

	var dbName string
	if err := conn.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&dbName); err != nil {
		return 0, 0, err
	}
	baseTables, views, err := listTables(ctx, conn)
	if err != nil {
		return 0, 0, err
	}

	w := bufio.NewWriterSize(out, 1<<20)
	fmt.Fprintf(w, "-- Backup database LPPM `%s`\n-- Dibuat %s\n-- Pulihkan: gunzip < file.sql.gz | mysql -u <user> -p <database>\n\n",
		dbName, time.Now().UTC().Format(time.RFC3339))
	w.WriteString("SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n")
	for _, v := range views {
		fmt.Fprintf(w, "DROP VIEW IF EXISTS %s;\n", quoteIdent(v))
	}
	for _, t := range baseTables {
		n, err := dumpTable(ctx, conn, w, t)
		if err != nil {
			return 0, 0, fmt.Errorf("tabel %s: %w", t, err)
		}
		rows += n
	}
	for _, v := range views {
		var name, create string
		var charset, collation sql.NullString
		if err := conn.QueryRowContext(ctx, "SHOW CREATE VIEW "+quoteIdent(v)).Scan(&name, &create, &charset, &collation); err != nil {
			return 0, 0, fmt.Errorf("view %s: %w", v, err)
		}
		// DEFINER dibuang agar bisa dipulihkan oleh user database mana pun.
		create = definerRe.ReplaceAllString(create, "")
		fmt.Fprintf(w, "\n-- VIEW %s\n%s;\n", v, create)
	}
	w.WriteString("\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n-- Selesai\n")
	if err := w.Flush(); err != nil {
		return 0, 0, err
	}
	return len(baseTables), rows, nil
}

var definerRe = regexp.MustCompile(`DEFINER=\S+\s+(SQL SECURITY DEFINER\s+)?`)

func listTables(ctx context.Context, conn *sql.Conn) (baseTables, views []string, err error) {
	rs, err := conn.QueryContext(ctx, "SHOW FULL TABLES")
	if err != nil {
		return nil, nil, err
	}
	defer rs.Close()
	for rs.Next() {
		var name, kind string
		if err := rs.Scan(&name, &kind); err != nil {
			return nil, nil, err
		}
		if kind == "VIEW" {
			views = append(views, name)
		} else {
			baseTables = append(baseTables, name)
		}
	}
	sort.Strings(baseTables)
	sort.Strings(views)
	return baseTables, views, rs.Err()
}

// maxInsertBytes membatasi panjang satu pernyataan INSERT (di bawah max_allowed_packet default).
const maxInsertBytes = 4 << 20

func dumpTable(ctx context.Context, conn *sql.Conn, w *bufio.Writer, table string) (int64, error) {
	var name, create string
	if err := conn.QueryRowContext(ctx, "SHOW CREATE TABLE "+quoteIdent(table)).Scan(&name, &create); err != nil {
		return 0, err
	}
	fmt.Fprintf(w, "\n-- TABEL %s\nDROP TABLE IF EXISTS %s;\n%s;\n", table, quoteIdent(table), create)

	rs, err := conn.QueryContext(ctx, "SELECT * FROM "+quoteIdent(table))
	if err != nil {
		return 0, err
	}
	defer rs.Close()
	cols, err := rs.ColumnTypes()
	if err != nil {
		return 0, err
	}
	names := make([]string, len(cols))
	types := make([]string, len(cols))
	for i, c := range cols {
		names[i] = quoteIdent(c.Name())
		types[i] = strings.ToUpper(c.DatabaseTypeName())
	}
	prefix := "INSERT INTO " + quoteIdent(table) + " (" + strings.Join(names, ",") + ") VALUES\n"
	raw := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range raw {
		ptrs[i] = &raw[i]
	}
	var count int64
	var stmt strings.Builder
	flush := func() {
		if stmt.Len() > 0 {
			w.WriteString(prefix)
			w.WriteString(stmt.String())
			w.WriteString(";\n")
			stmt.Reset()
		}
	}
	var row strings.Builder
	for rs.Next() {
		if err := rs.Scan(ptrs...); err != nil {
			return 0, err
		}
		row.Reset()
		row.WriteByte('(')
		for i, v := range raw {
			if i > 0 {
				row.WriteByte(',')
			}
			writeSQLValue(&row, types[i], v)
		}
		row.WriteByte(')')
		if stmt.Len() > 0 && stmt.Len()+row.Len() > maxInsertBytes {
			flush()
		}
		if stmt.Len() > 0 {
			stmt.WriteString(",\n")
		}
		stmt.WriteString(row.String())
		count++
	}
	if err := rs.Err(); err != nil {
		return 0, err
	}
	flush()
	return count, nil
}

func quoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func isNumericType(t string) bool {
	switch t {
	case "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT", "DECIMAL", "NEWDECIMAL", "FLOAT", "DOUBLE", "YEAR",
		"UNSIGNED TINYINT", "UNSIGNED SMALLINT", "UNSIGNED MEDIUMINT", "UNSIGNED INT", "UNSIGNED BIGINT":
		return true
	}
	return false
}

func isBinaryType(t string) bool {
	return strings.Contains(t, "BLOB") || strings.Contains(t, "BINARY") || t == "BIT" || t == "GEOMETRY"
}

func writeSQLValue(b *strings.Builder, dbType string, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("NULL")
	case int64:
		b.WriteString(strconv.FormatInt(x, 10))
	case uint64:
		b.WriteString(strconv.FormatUint(x, 10))
	case float64:
		b.WriteString(strconv.FormatFloat(x, 'g', -1, 64))
	case float32:
		b.WriteString(strconv.FormatFloat(float64(x), 'g', -1, 32))
	case time.Time:
		b.WriteString("'" + x.UTC().Format("2006-01-02 15:04:05.000000") + "'")
	case []byte:
		switch {
		case isBinaryType(dbType):
			if len(x) == 0 {
				b.WriteString("''")
			} else {
				b.WriteString("0x")
				b.WriteString(hex.EncodeToString(x))
			}
		case isNumericType(dbType):
			b.Write(x)
		default:
			writeSQLString(b, string(x))
		}
	case string:
		writeSQLString(b, x)
	default:
		writeSQLString(b, fmt.Sprint(x))
	}
}

func writeSQLString(b *strings.Builder, s string) {
	b.WriteByte('\'')
	for i := 0; i < len(s); i++ {
		switch c := s[i]; c {
		case 0:
			b.WriteString(`\0`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\\':
			b.WriteString(`\\`)
		case '\'':
			b.WriteString(`\'`)
		case 0x1a:
			b.WriteString(`\Z`)
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte('\'')
}
