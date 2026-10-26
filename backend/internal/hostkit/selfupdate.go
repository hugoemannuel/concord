package hostkit

import (
	"context"
	"crypto/ed25519"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Atualização do servidor pelo GitHub Releases, sem servidor nosso no meio:
//
//  1. lê <releases>/latest/download/server-latest.yml (versão, arquivo e sha512
//     do pacote de cada sistema);
//  2. versão mais nova, de madrugada e com ninguém em chamada: baixa o pacote e
//     o .sig, confere a assinatura Ed25519 com a chave pública embutida no
//     salinha-host (a privada só existe no secret do GitHub Actions) e o
//     sha512, e extrai em <pasta>/app.new (StageUpdate);
//  3. o supervisor sai; o systemd o religa e o "salinha-host pre-start"
//     (ExecStartPre) troca app → app.prev e app.new → app (PreStart);
//  4. a versão nova no ar confirma (ConfirmUpdate). Se ela não subir em
//     maxUpdateAttempts partidas, o pre-start volta para o app.prev sozinho.
//
// O pacote novo traz o app da mesma versão em updates/: os amigos se
// atualizam pelo servidor logo depois (updates.Watcher do backend avisa).

// UpdateConfig vem do build do salinha-host (-ldflags).
type UpdateConfig struct {
	// ReleasesURL: https://github.com/<dono>/<repo>/releases
	ReleasesURL string
	// PublicKeyPEM: chave Ed25519 que assina os pacotes ("" = sem atualização).
	PublicKeyPEM string
	Version      string
}

func (c UpdateConfig) enabled() bool {
	return c.ReleasesURL != "" && c.PublicKeyPEM != "" && c.Version != "" && c.Version != "dev"
}

func (c UpdateConfig) manifestURL() string {
	return strings.TrimRight(c.ReleasesURL, "/") + "/latest/download/server-latest.yml"
}

func (c UpdateConfig) fileURL(version, file string) string {
	return fmt.Sprintf("%s/download/v%s/%s", strings.TrimRight(c.ReleasesURL, "/"), version, file)
}

// Manifest é o server-latest.yml.
type Manifest struct {
	Version string
	// Files e Sha512 por sistema ("linux"; "windows" fica para testes locais).
	Files  map[string]string
	Sha512 map[string]string
}

// ParseManifest lê o formato simples "chave: valor" do server-latest.yml.
func ParseManifest(text string) (Manifest, error) {
	m := Manifest{Files: map[string]string{}, Sha512: map[string]string{}}
	for _, line := range strings.Split(text, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok || strings.HasPrefix(key, "#") {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		switch {
		case key == "version":
			m.Version = value
		case strings.HasSuffix(key, "_sha512"):
			m.Sha512[strings.TrimSuffix(key, "_sha512")] = value
		case key == "windows" || key == "linux":
			m.Files[key] = value
		}
	}
	if _, err := parseVersion(m.Version); err != nil {
		return m, fmt.Errorf("server-latest.yml sem versão válida: %w", err)
	}
	return m, nil
}

func parseVersion(v string) ([3]int, error) {
	var out [3]int
	parts := strings.Split(strings.TrimPrefix(v, "v"), ".")
	if len(parts) != 3 {
		return out, fmt.Errorf("versão %q", v)
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, fmt.Errorf("versão %q", v)
		}
		out[i] = n
	}
	return out, nil
}

// Newer: a é mais nova que b (x.y.z).
func Newer(a, b string) bool {
	va, err := parseVersion(a)
	if err != nil {
		return false
	}
	vb, err := parseVersion(b)
	if err != nil {
		return true
	}
	for i := range va {
		if va[i] != vb[i] {
			return va[i] > vb[i]
		}
	}
	return false
}

func platformKey() string {
	if runtime.GOOS == "windows" {
		return "windows"
	}
	return "linux"
}

// inUpdateWindow: de madrugada (3h às 6h, hora da VPS), quando ninguém usa.
func inUpdateWindow(t time.Time) bool {
	return t.Hour() >= 3 && t.Hour() < 6
}

// VerifyPackage confere o sha512 (do manifesto) e a assinatura Ed25519 (.sig,
// base64, a mesma do scripts/release-*.sh).
func VerifyPackage(data []byte, sha512B64, sigB64, publicKeyPEM string) error {
	if sha512B64 != "" {
		sum := sha512.Sum512(data)
		if base64.StdEncoding.EncodeToString(sum[:]) != sha512B64 {
			return errors.New("sha512 não confere")
		}
	}
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return errors.New("chave pública inválida")
	}
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return err
	}
	pub, ok := key.(ed25519.PublicKey)
	if !ok {
		return errors.New("a chave pública não é Ed25519")
	}
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(sigB64))
	if err != nil || len(sig) != ed25519.SignatureSize {
		return errors.New("assinatura malformada")
	}
	if !ed25519.Verify(pub, data, sig) {
		return errors.New("assinatura inválida")
	}
	return nil
}

var updateClient = &http.Client{Timeout: 30 * time.Minute}

func fetch(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := updateClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: status %d", url, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, limit))
}

// CheckUpdate devolve o manifesto se houver versão mais nova para este sistema.
func CheckUpdate(ctx context.Context, cfg UpdateConfig) (*Manifest, error) {
	text, err := fetch(ctx, cfg.manifestURL(), 64<<10)
	if err != nil {
		return nil, err
	}
	m, err := ParseManifest(string(text))
	if err != nil {
		return nil, err
	}
	if !Newer(m.Version, cfg.Version) || m.Files[platformKey()] == "" {
		return nil, nil
	}
	return &m, nil
}

// StageUpdate baixa, confere e extrai a versão nova em <pasta>/app.new e marca
// a troca como pendente (o pre-start da próxima partida aplica).
func StageUpdate(ctx context.Context, l Layout, cfg UpdateConfig, m *Manifest) error {
	file := m.Files[platformKey()]
	if strings.ContainsAny(file, `/\`) {
		return fmt.Errorf("nome de pacote inválido: %q", file)
	}
	sig, err := fetch(ctx, cfg.fileURL(m.Version, file+".sig"), 4<<10)
	if err != nil {
		return err
	}
	data, err := fetch(ctx, cfg.fileURL(m.Version, file), 1<<30)
	if err != nil {
		return err
	}
	if err := VerifyPackage(data, m.Sha512[platformKey()], string(sig), cfg.PublicKeyPEM); err != nil {
		return fmt.Errorf("pacote %s recusado: %w", m.Version, err)
	}
	downloads := filepath.Join(l.Root, "download")
	if err := os.MkdirAll(downloads, 0o700); err != nil {
		return err
	}
	archive := filepath.Join(downloads, file)
	if err := os.WriteFile(archive, data, 0o600); err != nil {
		return err
	}
	defer os.Remove(archive)
	if err := extractPackage(archive, l.NewApp()); err != nil {
		return err
	}
	return writePending(l, pendingUpdate{Version: m.Version, Phase: "staged"})
}

// extractPackage extrai num diretório novo e confere que é um pacote do servidor.
func extractPackage(archive, dest string) error {
	_ = os.RemoveAll(dest)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	// tar do sistema: o do Windows 10+ (bsdtar) também abre .zip.
	cmd := exec.Command("tar", "-xf", archive, "-C", dest)
	prepareChild(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("extrair: %w: %s", err, tail(out))
	}
	if _, err := os.Stat(filepath.Join(dest, "bin", exe("salinha-host"))); err != nil {
		return errors.New("pacote sem bin/salinha-host")
	}
	return nil
}

// pendingUpdate é o data/update.json: em que pé está a troca de versão.
type pendingUpdate struct {
	Version string `json:"version"`
	// Phase: "staged" (app.new pronto) ou "verifying" (trocado, esperando subir).
	Phase string `json:"phase"`
	// Attempts: partidas da versão nova que ainda não confirmaram.
	Attempts int `json:"attempts"`
}

// maxUpdateAttempts: partidas sem confirmar antes de voltar para a anterior.
const maxUpdateAttempts = 2

func pendingPath(l Layout) string { return filepath.Join(l.Data(), "update.json") }

func readPending(l Layout) (pendingUpdate, bool) {
	var p pendingUpdate
	data, err := os.ReadFile(pendingPath(l))
	if err != nil || json.Unmarshal(data, &p) != nil {
		return p, false
	}
	return p, true
}

func writePending(l Layout, p pendingUpdate) error {
	data, _ := json.Marshal(p)
	return writeFileAtomic(pendingPath(l), data, 0o600)
}

// PreStart roda antes de cada partida do supervisor (ExecStartPre do systemd):
// aplica a versão preparada ou, se ela não confirmou a tempo, volta para a
// anterior. Sem atualização pendente, não faz nada.
func PreStart(l Layout) error {
	p, ok := readPending(l)
	if !ok {
		return nil
	}
	switch p.Phase {
	case "staged":
		if _, err := os.Stat(l.NewApp()); err != nil {
			return os.Remove(pendingPath(l))
		}
		_ = os.RemoveAll(l.PrevApp())
		if err := os.Rename(l.App(), l.PrevApp()); err != nil {
			return fmt.Errorf("guardar a versão atual: %w", err)
		}
		if err := os.Rename(l.NewApp(), l.App()); err != nil {
			_ = os.Rename(l.PrevApp(), l.App())
			_ = os.Remove(pendingPath(l))
			return fmt.Errorf("trocar pela versão nova: %w", err)
		}
		log.Printf("[update] versão %s aplicada; esperando ela subir", p.Version)
		return writePending(l, pendingUpdate{Version: p.Version, Phase: "verifying", Attempts: 1})
	case "verifying":
		if p.Attempts < maxUpdateAttempts {
			p.Attempts++
			return writePending(l, p)
		}
		log.Printf("[update] versão %s não subiu em %d partidas; voltando à anterior", p.Version, p.Attempts)
		failed := filepath.Join(l.Root, "app.failed")
		_ = os.RemoveAll(failed)
		if err := os.Rename(l.App(), failed); err != nil {
			return fmt.Errorf("voltar: %w", err)
		}
		if err := os.Rename(l.PrevApp(), l.App()); err != nil {
			return fmt.Errorf("voltar: %w", err)
		}
		return os.Remove(pendingPath(l))
	}
	return os.Remove(pendingPath(l))
}

// ConfirmUpdate: a versão nova subiu inteira; a troca vale.
func ConfirmUpdate(l Layout) {
	if p, ok := readPending(l); ok && p.Phase == "verifying" {
		log.Printf("[update] versão %s no ar", p.Version)
		_ = os.Remove(pendingPath(l))
	}
}

// updateCheckEvery: com que frequência o supervisor confere (só instala na
// janela da madrugada).
const updateCheckEvery = 30 * time.Minute

// autoUpdate roda no supervisor: na janela da madrugada, com a atualização
// automática ligada e ninguém em chamada, prepara a versão nova e chama
// restartForUpdate (o supervisor sai e o systemd o religa pela versão nova).
func (s *Supervisor) autoUpdate(ctx context.Context, cfg UpdateConfig, restartForUpdate func()) {
	if !cfg.enabled() {
		return
	}
	ticker := time.NewTicker(updateCheckEvery)
	defer ticker.Stop()
	var lastCheck time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.mu.Lock()
			on := s.cfg.AutoUpdate
			s.mu.Unlock()
			if !on || !inUpdateWindow(now) || now.Sub(lastCheck) < 2*time.Hour {
				continue
			}
			lastCheck = now
			if err := s.TryUpdate(ctx, cfg, false); err != nil {
				log.Printf("[update] %v", err)
				continue
			}
			if p, ok := readPending(s.l); ok && p.Phase == "staged" {
				log.Printf("[update] %s pronta; reiniciando pela versão nova", p.Version)
				restartForUpdate()
				return
			}
		}
	}
}

// TryUpdate confere e prepara a versão nova (sem aplicar). force ignora quem
// está em chamada (atualização pedida pelo host).
func (s *Supervisor) TryUpdate(ctx context.Context, cfg UpdateConfig, force bool) error {
	m, err := CheckUpdate(ctx, cfg)
	if err != nil || m == nil {
		return err
	}
	if !force {
		callers, err := ActiveCallers(ctx, EnvValue(s.l.EnvFile(), "DATABASE_URL"))
		if err != nil {
			return err
		}
		if callers > 0 {
			log.Printf("[update] %s disponível; esperando a chamada acabar (%d na chamada)", m.Version, callers)
			return nil
		}
	}
	log.Printf("[update] baixando %s", m.Version)
	return StageUpdate(ctx, s.l, cfg, m)
}
