package linkpreview

import (
	"errors"
	"net/url"
	"strings"
)

// ErrInvalidURL: o link não é http/https comum (porta padrão, sem usuário).
var ErrInvalidURL = errors.New("url inválida para prévia")

const maxURLLength = 2048

// NormalizeURL é a chave do cache: esquema e host em minúsculas, sem porta
// padrão e sem fragmento (#...). Recusa o que o cliente blindado recusaria de
// qualquer jeito, para nem gastar o limite.
func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || len(raw) > maxURLLength {
		return "", ErrInvalidURL
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if u.Scheme != "http" && u.Scheme != "https" || u.User != nil || u.Hostname() == "" {
		return "", ErrInvalidURL
	}
	port := u.Port()
	if port != "" && port != "80" && port != "443" {
		return "", ErrInvalidURL
	}
	u.Host = hostPort(strings.ToLower(u.Hostname()), u.Scheme, port)
	u.Fragment = ""
	u.RawFragment = ""
	return u.String(), nil
}

// hostPort: a porta só fica quando não é a padrão do esquema (https://x:80 continua :80).
func hostPort(host, scheme, port string) string {
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port == "" || scheme == "http" && port == "80" || scheme == "https" && port == "443" {
		return host
	}
	return host + ":" + port
}
