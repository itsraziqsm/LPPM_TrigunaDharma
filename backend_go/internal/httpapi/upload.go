package httpapi

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
)

const (
	maxUploadBytes = 10 * 1024 * 1024
	mimeDOCX       = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

// uploadedFile mirrors multer's req.file (memory storage).
type uploadedFile struct {
	fieldname    string
	originalname string
	mimetype     string
	data         []byte
	size         int64
}

// multerSingle mirrors multer({storage: memoryStorage(), limits: {fileSize:
// 10MB}, fileFilter: PDF/DOCX only}).single(field). Errors raised by multer
// have no HTTP status, so Node answers them with 500.
func multerSingle(field string) step {
	return func(c *Ctx) error {
		mediaType, params, err := mime.ParseMediaType(c.r.Header.Get("Content-Type"))
		if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
			return nil
		}
		boundary := params["boundary"]
		if boundary == "" {
			return plainError("Multipart: Boundary not found")
		}
		reader := multipart.NewReader(c.r.Body, boundary)
		body := map[string]any{}
		var file *uploadedFile
		for {
			part, err := reader.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return plainError("Unexpected end of form")
			}
			name := part.FormName()
			filename := part.FileName()
			if filename == "" && part.Header.Get("Content-Type") == "" {
				value, err := io.ReadAll(io.LimitReader(part, 1024*1024+1))
				part.Close()
				if err != nil {
					return plainError("Unexpected end of form")
				}
				if len(value) > 1024*1024 {
					return plainError("Field value too long")
				}
				appendField(body, name, string(value))
				continue
			}
			if name != field || file != nil {
				part.Close()
				return plainError("Unexpected field")
			}
			mimetype := part.Header.Get("Content-Type")
			if mimetype == "" {
				mimetype = "application/octet-stream"
			}
			if mt, _, err := mime.ParseMediaType(mimetype); err == nil {
				mimetype = mt
			}
			if mimetype != "application/pdf" && mimetype != mimeDOCX {
				part.Close()
				return plainError("Hanya file PDF atau DOCX yang diizinkan.")
			}
			data, err := io.ReadAll(io.LimitReader(part, maxUploadBytes+1))
			part.Close()
			if err != nil {
				return plainError("Unexpected end of form")
			}
			if len(data) > maxUploadBytes {
				return plainError("File too large")
			}
			file = &uploadedFile{fieldname: name, originalname: filename, mimetype: mimetype, data: data, size: int64(len(data))}
		}
		c.body = body
		c.file = file
		return nil
	}
}

func appendField(body map[string]any, name, value string) {
	existing, ok := body[name]
	if !ok {
		body[name] = value
		return
	}
	switch v := existing.(type) {
	case []any:
		body[name] = append(v, value)
	default:
		body[name] = []any{v, value}
	}
}

// ── file type detection (file-type@16 fromBuffer) ─────────────────────────

// detectFileType returns the MIME type detected from magic bytes, or "".
func detectFileType(buf []byte) string {
	has := func(offset int, sig ...byte) bool {
		if len(buf) < offset+len(sig) {
			return false
		}
		return bytes.Equal(buf[offset:offset+len(sig)], sig)
	}
	switch {
	case len(buf) < 2:
		return ""
	case has(0, 'B', 'M') && len(buf) > 14:
		return "image/bmp"
	case has(0, 0x1F, 0x8B, 0x08):
		return "application/gzip"
	case has(0, 0xFF, 0xD8, 0xFF):
		return "image/jpeg"
	case has(0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A):
		return "image/png"
	case has(0, 'G', 'I', 'F'):
		return "image/gif"
	case has(0, 'R', 'I', 'F', 'F') && has(8, 'W', 'E', 'B', 'P'):
		return "image/webp"
	case has(0, '%', 'P', 'D', 'F'):
		rest := buf
		if len(rest) > 1350 {
			rest = rest[1350:]
		}
		if bytes.Contains(rest, []byte("AIPrivateData")) {
			return "application/postscript"
		}
		return "application/pdf"
	case has(0, 'P', 'K', 0x03, 0x04):
		return detectZipType(buf)
	case has(0, 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1):
		return "application/x-cfb"
	case has(0, '{', '\\', 'r', 't', 'f'):
		return "application/rtf"
	case has(0, 'R', 'a', 'r', '!', 0x1A, 0x07):
		return "application/x-rar-compressed"
	case has(0, '7', 'z', 0xBC, 0xAF, 0x27, 0x1C):
		return "application/x-7z-compressed"
	case has(4, 'f', 't', 'y', 'p'):
		return "video/mp4"
	case has(0, 'I', 'D', '3'):
		return "audio/mpeg"
	case has(0, '<', '?', 'x', 'm', 'l', ' '):
		return "application/xml"
	case has(0, 0x7F, 'E', 'L', 'F'):
		return "application/x-elf"
	case has(0, 'M', 'Z'):
		return "application/x-msdownload"
	}
	return ""
}

func detectZipType(buf []byte) string {
	pos := 0
	size := len(buf)
	for pos+30 < size {
		header := buf[pos : pos+30]
		compressed := int(binary.LittleEndian.Uint32(header[18:22]))
		uncompressed := int(binary.LittleEndian.Uint32(header[22:26]))
		nameLen := int(binary.LittleEndian.Uint16(header[26:28]))
		extraLen := int(binary.LittleEndian.Uint16(header[28:30]))
		pos += 30
		if pos+nameLen > size {
			break
		}
		name := string(buf[pos : pos+nameLen])
		pos += nameLen + extraLen
		if name == "META-INF/mozilla.rsa" {
			return "application/x-xpinstall"
		}
		if strings.HasSuffix(name, ".rels") || strings.HasSuffix(name, ".xml") {
			switch strings.Split(name, "/")[0] {
			case "word":
				return mimeDOCX
			case "ppt":
				return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
			case "xl":
				return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
			}
		}
		if strings.HasPrefix(name, "xl/") {
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		}
		if name == "mimetype" && compressed == uncompressed && pos+compressed <= size {
			switch string(buf[pos : pos+compressed]) {
			case "application/epub+zip":
				return "application/epub+zip"
			case "application/vnd.oasis.opendocument.text":
				return "application/vnd.oasis.opendocument.text"
			case "application/vnd.oasis.opendocument.spreadsheet":
				return "application/vnd.oasis.opendocument.spreadsheet"
			case "application/vnd.oasis.opendocument.presentation":
				return "application/vnd.oasis.opendocument.presentation"
			}
		}
		if compressed == 0 {
			next := -1
			for next < 0 && pos < size {
				end := pos + 4100
				if end > size {
					end = size
				}
				next = bytes.Index(buf[pos:end], []byte{'P', 'K', 0x03, 0x04})
				if next >= 0 {
					pos += next
				} else {
					pos = end
				}
			}
		} else {
			pos += compressed
		}
	}
	return "application/zip"
}

// validateFileIsAllowedDocument mirrors utils/fileValidation.ts.
func validateFileIsAllowedDocument(data []byte) (string, error) {
	detected := detectFileType(data)
	switch detected {
	case "":
		return "", httpError(http.StatusBadRequest, "Tidak dapat mendeteksi tipe file. Pastikan file tidak corrupt.")
	case "application/pdf", mimeDOCX:
		return detected, nil
	}
	return "", httpError(http.StatusBadRequest, `Tipe file "`+detected+`" tidak diizinkan. Hanya PDF atau DOCX yang diizinkan.`)
}
