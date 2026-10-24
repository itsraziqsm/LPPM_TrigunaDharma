package httpapi

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"lppm-backend-go/internal/config"
)

func sendSMTP(cfg config.Config, to, name, resetURL string) error {
	address := net.JoinHostPort(cfg.SMTPHost, cfg.SMTPPort)
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.Dial("tcp", address)
	if err != nil {
		return fmt.Errorf("connect SMTP: %w", err)
	}
	if cfg.SMTPSecure {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: cfg.SMTPHost, MinVersion: tls.VersionTLS12})
		if err := tlsConn.Handshake(); err != nil {
			conn.Close()
			return fmt.Errorf("establish SMTP TLS: %w", err)
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		conn.Close()
		return fmt.Errorf("create SMTP client: %w", err)
	}
	defer client.Close()
	if !cfg.SMTPSecure {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: cfg.SMTPHost, MinVersion: tls.VersionTLS12}); err != nil {
				return fmt.Errorf("start SMTP TLS: %w", err)
			}
		}
	}
	if cfg.SMTPUser != "" {
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("authenticate SMTP: %w", err)
		}
	}
	if err := client.Mail(cfg.SMTPUser); err != nil {
		return fmt.Errorf("set SMTP sender: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("set SMTP recipient: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("open SMTP message: %w", err)
	}
	subject := "Reset Password"
	html := fmt.Sprintf(`<h2>Halo, %s</h2><p>Klik link berikut untuk reset password Anda (berlaku 1 jam):</p><a href="%s">Reset Password</a><p>Jika Anda tidak meminta reset password, abaikan email ini.</p><p>Link kadaluarsa dalam 1 jam.</p>`,
		htmlEscape(name), htmlEscape(resetURL))
	message := strings.Join([]string{
		fmt.Sprintf("From: \"%s\" <%s>", cfg.AppName, cfg.SMTPUser),
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		html,
	}, "\r\n")
	if _, err := writer.Write([]byte(message)); err != nil {
		writer.Close()
		return fmt.Errorf("write SMTP message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("send SMTP message: %w", err)
	}
	return client.Quit()
}

func htmlEscape(value string) string {
	value = strings.ReplaceAll(value, "&", "&amp;")
	value = strings.ReplaceAll(value, "<", "&lt;")
	value = strings.ReplaceAll(value, ">", "&gt;")
	value = strings.ReplaceAll(value, "\"", "&quot;")
	return strings.ReplaceAll(value, "'", "&#39;")
}
