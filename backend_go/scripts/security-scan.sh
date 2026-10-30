#!/usr/bin/env sh
# Pemindaian keamanan backend: go vet, unit test, gosec (analisis kode), govulncheck (dependensi
# & standard library). Jalankan dari folder backend_go:
#
#   sh scripts/security-scan.sh
#
# Alat dipasang sekali dengan:
#   go install github.com/securego/gosec/v2/cmd/gosec@latest
#   go install golang.org/x/vuln/cmd/govulncheck@latest
#
# Keluar dengan kode bukan 0 bila ada temuan, jadi bisa dipakai di CI. Lihat SECURITY.md.
set -eu
cd "$(dirname "$0")/.."

GOBIN_DIR="$(go env GOPATH)/bin"
PATH="$PATH:$GOBIN_DIR"

need() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "✗ $1 belum terpasang. Pasang dengan: go install $2@latest" >&2
		exit 2
	fi
}
need gosec github.com/securego/gosec/v2/cmd/gosec
need govulncheck golang.org/x/vuln/cmd/govulncheck

echo "== go vet"
go vet ./...

echo "== go test"
go test ./...

echo "== gosec"
gosec -quiet ./...
echo "gosec: tidak ada temuan"

echo "== govulncheck"
govulncheck ./...

echo "✔ Pemindaian keamanan selesai tanpa temuan."
