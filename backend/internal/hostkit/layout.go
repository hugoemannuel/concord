// Package hostkit é o "Salinha Servidor": sobe a Salinha inteira numa VPS
// (Postgres portátil, LiveKit, backend e Caddy com HTTPS), sem Docker, para
// quem escolheu "Hospedar um servidor" na tela inicial do app. O app instala
// pelo SSH (deploy.go) e o supervisor (supervisor.go) mantém tudo no ar.
package hostkit

import (
	"os"
	"path/filepath"
	"runtime"
)

// Layout são as pastas do servidor local.
//
//	<Root>/app/        pacote da versão atual (trocado inteiro numa atualização)
//	  bin/             salinha-host, concord-server, livekit-server, postgres/…
//	  migrations/      SQL do backend
//	  updates/         instalador do app da mesma versão (os amigos se atualizam daqui)
//	<Root>/app.prev/   pacote anterior (volta sozinho se a atualização não subir)
//	<Root>/data/       tudo que é da pessoa e nunca é trocado:
//	  .env, host.json, livekit.yaml, pgdata/, uploads/, logs/
type Layout struct {
	Root string
}

// VPSRoot: onde o deploy instala na VPS (como root).
const VPSRoot = "/opt/salinha-server"

// DefaultRoot: /opt/salinha-server como root (VPS); senão
// %LOCALAPPDATA%\SalinhaServidor no Windows ou ~/.local/share/salinha-server
// (testes e desenvolvimento).
func DefaultRoot() (string, error) {
	if runtime.GOOS != "windows" && os.Geteuid() == 0 {
		return VPSRoot, nil
	}
	if runtime.GOOS == "windows" {
		if dir := os.Getenv("LOCALAPPDATA"); dir != "" {
			return filepath.Join(dir, "SalinhaServidor"), nil
		}
	}
	if dir := os.Getenv("XDG_DATA_HOME"); dir != "" {
		return filepath.Join(dir, "salinha-server"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "share", "salinha-server"), nil
}

func (l Layout) App() string         { return filepath.Join(l.Root, "app") }
func (l Layout) PrevApp() string     { return filepath.Join(l.Root, "app.prev") }
func (l Layout) NewApp() string      { return filepath.Join(l.Root, "app.new") }
func (l Layout) Data() string        { return filepath.Join(l.Root, "data") }
func (l Layout) EnvFile() string     { return filepath.Join(l.Data(), ".env") }
func (l Layout) HostFile() string    { return filepath.Join(l.Data(), "host.json") }
func (l Layout) LiveKitFile() string { return filepath.Join(l.Data(), "livekit.yaml") }
func (l Layout) PgData() string      { return filepath.Join(l.Data(), "pgdata") }
func (l Layout) Logs() string        { return filepath.Join(l.Data(), "logs") }
func (l Layout) CaddyFile() string   { return filepath.Join(l.Data(), "Caddyfile") }
func (l Layout) CaddyData() string   { return filepath.Join(l.Data(), "caddy") }
func (l Layout) Migrations() string  { return filepath.Join(l.App(), "migrations") }
func (l Layout) Updates() string     { return filepath.Join(l.App(), "updates") }

// Bin é um executável do pacote (com .exe no Windows).
func (l Layout) Bin(name string) string {
	return filepath.Join(l.App(), "bin", exe(name))
}

// PgBin é um executável do Postgres portátil (bin/postgres/bin/<nome>).
func (l Layout) PgBin(name string) string {
	return filepath.Join(l.App(), "bin", "postgres", "bin", exe(name))
}

func exe(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
