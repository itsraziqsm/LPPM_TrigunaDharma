package httpapi

import (
	"database/sql"
	"testing"
	"time"
)

func TestUserRecordsJSONUsesAPIFieldNames(t *testing.T) {
	createdAt := time.Date(2026, time.October, 20, 12, 0, 0, 0, time.UTC)
	users := userRecordsJSON([]userRecord{{
		ID:           7,
		Email:        "user@example.com",
		Name:         "User",
		FullName:     sql.NullString{String: "Full User", Valid: true},
		Status:       "approved",
		ProgramStudi: sql.NullString{String: "Informatika", Valid: true},
		CreatedAt:    createdAt,
		Roles:        []string{"dosen"},
	}})
	if len(users) != 1 {
		t.Fatalf("got %d users, want 1", len(users))
	}
	user := users[0]
	if user["id"] != int64(7) || user["email"] != "user@example.com" ||
		user["fullName"] != "Full User" || user["programStudi"] != "Informatika" ||
		user["status"] != "approved" || user["createdAt"] != createdAt {
		t.Fatalf("unexpected user API fields: %#v", user)
	}
	if _, ok := user["ID"]; ok {
		t.Fatalf("Go struct field name leaked into API response: %#v", user)
	}
	roles, ok := user["roles"].([]map[string]any)
	if !ok || len(roles) != 1 || roles[0]["role"].(map[string]string)["name"] != "dosen" {
		t.Fatalf("unexpected roles field: %#v", user["roles"])
	}
}
