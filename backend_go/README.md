# LPPM backend (Go)

This directory contains the Go implementation and uses the existing MySQL
database/schema. The original TypeScript backend remains unchanged while the
port is developed.

## Run

1. Copy `.env.example` to `.env` and configure the database and JWT secrets.
2. Install Go 1.23 or newer.
3. Run `go mod download`, then `go run ./cmd/server`.

The server listens on `PORT` (default `3000`). The `/health` endpoint is
available without authentication. API routes retain the `/api/v1` prefix.

## Port status

The Go implementation includes the server foundation, authentication, user
management, and handlers for proposals, periods, reviewers, reports,
notifications, dashboard, activity logs, and exports. Route registration and
the Go test, vet, and build checks pass. Database-backed integration testing
and full response/business-rule parity against the TypeScript API have not yet
been verified; validate these against a test database before switching
frontend or production traffic to this server.
