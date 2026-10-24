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

// sendSMTP mirrors utils/email.ts (nodemailer): same sender, subject and
// HTML body. SMTP_SECURE=true uses implicit TLS, otherwise STARTTLS is used
// when the server offers it.
func sendSMTP(cfg config.Config, to, name, resetURL string) error {
	html := `
    <h2>Halo, ` + name + `</h2>
    <p>Klik link berikut untuk reset password Anda (berlaku 1 jam):</p>
    <a href="` + resetURL + `" style="
      display:inline-block;
      padding:12px 24px;
      background:#4F46E5;
      color:#fff;
      text-decoration:none;
      border-radius:6px;
    ">Reset Password</a>
    <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
    <p style="color:#888;font-size:12px;">Link kadaluarsa dalam 1 jam.</p>
  `
	return sendMail(cfg, to, "Reset Password", html)
}

// sendMail sends one HTML email through the configured SMTP server.
func sendMail(cfg config.Config, to, subject, html string) error {
	address := net.JoinHostPort(cfg.SMTPHost, cfg.SMTPPort)
	dialer := &net.Dialer{Timeout: 15 * time.Second}
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
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)); err != nil {
				return fmt.Errorf("authenticate SMTP: %w", err)
			}
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
	appName := cfg.AppName
	if appName == "" {
		appName = "LPPM App"
	}
	message := strings.Join([]string{
		fmt.Sprintf("From: \"%s\" <%s>", appName, cfg.SMTPUser),
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"Date: " + time.Now().Format(time.RFC1123Z),
		"",
		strings.ReplaceAll(html, "\n", "\r\n"),
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
