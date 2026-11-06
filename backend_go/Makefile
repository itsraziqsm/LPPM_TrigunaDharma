# Jalan pintas perintah backend. Jalankan dari folder backend_go, mis. `make run`.
# `make` tanpa target menampilkan daftar perintah. Variabel bisa ditimpa: make e2e URL=http://localhost:3233

URL ?= http://localhost:3000

.DEFAULT_GOAL := help
.PHONY: help run migrate status seed seed-email seed-proposal seed-tahap-1 truncate test vet scan e2e build docker

help: ## Tampilkan daftar perintah
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-14s %s\n", $$1, $$2}'

run: ## Nyalakan server (= go run .)
	go run .

migrate: ## Terapkan migrasi database
	go run ./cmd/migrate

status: ## Lihat status migrasi
	go run ./cmd/migrate -status

seed: ## Role + akun demo + periode
	go run ./cmd/seed

seed-email: ## 6 akun contoh @email.com
	go run ./cmd/seed-email

seed-proposal: ## Proposal & laporan contoh semua status
	go run ./cmd/seed-proposal

seed-tahap-1: ## Laporan contoh untuk proposal disetujui
	go run ./cmd/seed-tahap-1

truncate: ## Pratinjau kosongkan data kecuali user (hapus sungguhan: go run ./cmd/truncate-data -yes)
	go run ./cmd/truncate-data

test: ## Unit test
	go test ./...

vet: ## go vet
	go vet ./...

scan: ## go vet + test + gosec + govulncheck
	sh scripts/security-scan.sh

e2e: ## Tes E2E ke server yang sedang jalan (URL=...)
	python3 scripts/e2e.py $(URL)

build: ## Build binary ke bin/ (server, migrate, seed)
	go build -o bin/server ./cmd/server
	go build -o bin/migrate ./cmd/migrate
	go build -o bin/seed ./cmd/seed

docker: ## docker compose up --build
	docker compose up --build
