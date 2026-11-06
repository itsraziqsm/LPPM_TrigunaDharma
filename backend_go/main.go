// Jalan pintas untuk menyalakan server dari folder backend_go:
//
//	go run .
//
// Sama persis dengan `go run ./cmd/server` (keduanya memanggil app.RunServer).
// Command lain tetap lewat ./cmd/<nama>, mis. `go run ./cmd/migrate`.
package main

import "lppm-backend-go/internal/app"

func main() {
	app.RunServer()
}
