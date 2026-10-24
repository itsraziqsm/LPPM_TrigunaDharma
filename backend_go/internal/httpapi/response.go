package httpapi

import (
	"encoding/json"
	"net/http"
)

type responseEnvelope struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	Meta    any    `json:"meta,omitempty"`
	Errors  any    `json:"errors,omitempty"`
	Stack   string `json:"stack,omitempty"`
}

var jsonNull = json.RawMessage("null")

func sendJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return
	}
}

func sendSuccess(w http.ResponseWriter, message string, data any, status int) {
	sendJSON(w, status, responseEnvelope{Success: true, Message: message, Data: data})
}

func sendError(w http.ResponseWriter, message string, status int) {
	sendJSON(w, status, responseEnvelope{Success: false, Message: message})
}
