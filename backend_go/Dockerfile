# Stage 1: build
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed-tahap-1 ./cmd/seed-tahap-1 \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hapus-proposal-mahasiswa ./cmd/hapus-proposal-mahasiswa

# Stage 2: runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/ /app/
COPY migrations ./migrations
EXPOSE 3233
# migrations are applied on start (same as `prisma migrate deploy`)
CMD ["sh", "-c", "/app/migrate && /app/server"]
