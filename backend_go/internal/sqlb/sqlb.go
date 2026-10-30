// Package sqlb membangun query SQL dinamis (MySQL) secara aman.
//
// Aturan yang dijamin paket ini:
//   - NILAI selalu dikirim lewat placeholder `?` (argumen query), tidak pernah disambung ke
//     teks query.
//   - Bagian dinamis yang boleh masuk ke teks query hanya (a) identifier — nama tabel/kolom dari
//     daftar tetap di kode — yang divalidasi pola ^[A-Za-z_][A-Za-z0-9_]*$ lalu diberi backtick,
//     dan (b) deretan placeholder `?`.
//   - Identifier yang tidak valid → panic. Identifier tidak pernah berasal dari input pengguna,
//     jadi kegagalan berarti bug pemrograman (server memulihkan panic menjadi 500).
//   - Nama dari metadata database (mis. daftar tabel saat backup) memakai QuoteAny, yang
//     meng-escape backtick sehingga aman untuk nama apa pun.
//
// Dipakai menggantikan perangkaian string manual di handler (temuan gosec G202).
package sqlb

import (
	"regexp"
	"strconv"
	"strings"
)

var identRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// Ident mengembalikan `name` ber-backtick; panic bila name bukan identifier sederhana.
func Ident(name string) string {
	if !identRe.MatchString(name) {
		panic("sqlb: identifier tidak valid " + strconv.Quote(name))
	}
	return "`" + name + "`"
}

// QuoteAny meng-quote identifier apa pun dengan backtick (backtick di dalam nama digandakan).
// Hanya untuk nama yang berasal dari metadata database, bukan dari pengguna.
func QuoteAny(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

// Placeholders mengembalikan "?,?,?" sebanyak n; n ≤ 0 → "NULL" (IN (NULL) tidak cocok dengan
// baris mana pun).
func Placeholders(n int) string {
	if n <= 0 {
		return "NULL"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func identList(cols []string) string {
	if len(cols) == 0 {
		panic("sqlb: daftar kolom kosong")
	}
	quoted := make([]string, len(cols))
	for i, col := range cols {
		quoted[i] = Ident(col)
	}
	return strings.Join(quoted, ",")
}

// Insert: INSERT INTO `table` (`a`,`b`) VALUES (?,?).
func Insert(table string, cols []string) string {
	return "INSERT INTO " + Ident(table) + " (" + identList(cols) + ") VALUES (" + Placeholders(len(cols)) + ")"
}

// InsertIgnoreRows: INSERT IGNORE INTO `table` (`a`,`b`) VALUES (?,?),(?,?) untuk rows baris
// (argumen diurutkan per baris).
func InsertIgnoreRows(table string, cols []string, rows int) string {
	if rows <= 0 {
		panic("sqlb: jumlah baris harus > 0")
	}
	row := "(" + Placeholders(len(cols)) + ")"
	return "INSERT IGNORE INTO " + Ident(table) + " (" + identList(cols) + ") VALUES " +
		strings.TrimSuffix(strings.Repeat(row+",", rows), ",")
}

// UpdateByID: UPDATE `table` SET `a` = ?, `b` = ? WHERE `id` = ? (argumen: nilai kolom, lalu id).
func UpdateByID(table string, cols []string) string {
	if len(cols) == 0 {
		panic("sqlb: daftar kolom kosong")
	}
	sets := make([]string, len(cols))
	for i, col := range cols {
		sets[i] = Ident(col) + " = ?"
	}
	return "UPDATE " + Ident(table) + " SET " + strings.Join(sets, ", ") + " WHERE `id` = ?"
}

// InMarker adalah penanda daftar IN di query untuk In.
const InMarker = "(?*)"

// In mengganti setiap penanda "(?*)" di query (literal tetap di kode) dengan "(?,?,…)" sebanyak n;
// panic bila penanda tidak ada.
func In(query string, n int) string {
	if !strings.Contains(query, InMarker) {
		panic("sqlb: query tanpa penanda " + InMarker)
	}
	return strings.ReplaceAll(query, InMarker, "("+Placeholders(n)+")")
}

// SelectAll: SELECT * FROM `table` (nama tabel dari metadata database, lihat QuoteAny).
func SelectAll(table string) string {
	return "SELECT * FROM " + QuoteAny(table)
}
