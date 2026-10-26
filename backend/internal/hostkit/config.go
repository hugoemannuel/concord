package hostkit

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Network é como os amigos chegam ao servidor (vps.go).
type Network struct {
	// Mode: "vps" ("" = ainda não configurado).
	Mode string `json:"mode"`
	// PublicURL: o endereço que o host manda aos amigos (https://…).
	PublicURL string `json:"publicUrl"`
	// NodeIP: IP público que o LiveKit anuncia para a mídia (LIVEKIT_NODE_IP).
	NodeIP string `json:"nodeIp"`
	// Domain: domínio próprio (vazio = <ip>.sslip.io).
	Domain string `json:"domain,omitempty"`
}

// HostConfig é o data/host.json: o que o salinha-host decidiu no setup.
type HostConfig struct {
	Ports   Ports   `json:"ports"`
	Network Network `json:"network"`
	// AutoUpdate: atualiza sozinho pelo GitHub Releases (de madrugada, fora de chamada).
	AutoUpdate bool `json:"autoUpdate"`
	// TLSInternal: certificado da CA interna do Caddy (só testes).
	TLSInternal bool `json:"tlsInternal,omitempty"`
}

func ReadHostConfig(path string) (HostConfig, error) {
	var cfg HostConfig
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

// WriteHostConfig grava num arquivo temporário e troca (nunca fica pela metade).
func WriteHostConfig(path string, cfg HostConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, append(data, '\n'), 0o600)
}

// Secrets são gerados uma vez no setup e só vivem no data/.env.
type Secrets struct {
	JWT        string
	LiveKit    string
	DBPassword string
}

func NewSecrets() (Secrets, error) {
	var s Secrets
	var err error
	if s.JWT, err = randomHex(32); err != nil {
		return s, err
	}
	if s.LiveKit, err = randomHex(32); err != nil {
		return s, err
	}
	s.DBPassword, err = randomHex(24)
	return s, err
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

const (
	dbUser        = "concord"
	dbName        = "concord"
	liveKitAPIKey = "salinha"
)

// DatabaseURL do Postgres portátil (só em 127.0.0.1).
func DatabaseURL(port int, password string) string {
	return fmt.Sprintf("postgres://%s:%s@127.0.0.1:%d/%s?sslmode=disable", dbUser, password, port, dbName)
}

// RenderEnv monta o data/.env com os mesmos nomes do backend/.env.example.
// MIGRATIONS_DIR e UPDATES_DIR não entram: apontam para o pacote atual e o
// supervisor os passa no ambiente do processo.
func RenderEnv(p Ports, s Secrets, n Network) string {
	lines := []string{
		"# Gerado pelo Salinha Servidor (salinha-host setup). Os segredos daqui",
		"# assinam o login de todo mundo: não compartilhe este arquivo.",
		"",
		fmt.Sprintf("PORT=%d", p.Backend),
		"HOST=",
		"TRUSTED_PROXIES=",
		fmt.Sprintf("POSTGRES_PORT=%d", p.Postgres),
		"DATABASE_URL=" + DatabaseURL(p.Postgres, s.DBPassword),
		"JWT_SECRET=" + s.JWT,
		"LIVEKIT_API_KEY=" + liveKitAPIKey,
		"LIVEKIT_API_SECRET=" + s.LiveKit,
		fmt.Sprintf("LIVEKIT_PORT=%d", p.LiveKit),
		fmt.Sprintf("LIVEKIT_TCP_PORT=%d", p.LiveKitTCP),
		fmt.Sprintf("LIVEKIT_UDP_PORT=%d", p.LiveKitUDP),
		"LIVEKIT_NODE_IP=" + n.NodeIP,
		"PUBLIC_URL=" + n.PublicURL,
		"API_PUBLIC_URL=" + n.PublicURL,
		// Sem SMTP: as contas já nascem confirmadas (senão ninguém cria servidor).
		"EMAIL_VERIFICATION=off",
		"UPLOADS_DIR=uploads",
		"UPLOADS_MIN_FREE_GB=2",
		"GITHUB_REPO=",
		"",
	}
	return strings.Join(lines, "\n")
}

// SetEnvValues troca (ou acrescenta) chaves do .env sem mexer no resto.
func SetEnvValues(path string, values map[string]string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	done := map[string]bool{}
	for i, line := range lines {
		key, _, ok := strings.Cut(line, "=")
		if !ok || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		if v, want := values[key]; want {
			lines[i] = key + "=" + v
			done[key] = true
		}
	}
	keys := make([]string, 0, len(values))
	for k := range values {
		if !done[k] {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	for _, k := range keys {
		lines = append(lines, k+"="+values[k])
	}
	return writeFileAtomic(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600)
}

// EnvValue lê uma chave do .env ("" se não houver).
func EnvValue(path, key string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		k, v, ok := strings.Cut(strings.TrimRight(line, "\r"), "=")
		if ok && k == key {
			return v
		}
	}
	return ""
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
