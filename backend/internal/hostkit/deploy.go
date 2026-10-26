package hostkit

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Deploy instala (ou reinstala) o servidor numa VPS pelo SSH, do computador de
// quem vai hospedar (o app chama "salinha-host deploy"). A VPS baixa o pacote
// direto do GitHub Releases (mais rápido que subir de casa) e confere a
// assinatura com a chave pública daqui antes de abrir qualquer coisa.

// DeployOptions chegam pelo stdin em JSON (a senha nunca vai na linha de comando).
type DeployOptions struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	// KeyPath: arquivo da chave SSH privada (alternativa à senha).
	KeyPath       string `json:"keyPath"`
	KeyPassphrase string `json:"keyPassphrase"`
	Domain        string `json:"domain"`
	AutoUpdate    bool   `json:"autoUpdate"`
	// KnownHosts: arquivo local com a identidade das VPS já vistas.
	KnownHosts string `json:"knownHosts"`
	// Version: versão do servidor a instalar (a mesma do app).
	Version string `json:"version"`

	// Só testes: outro lugar para os pacotes, IP público e certificado interno.
	ReleasesURL string `json:"releasesUrl,omitempty"`
	PublicIP    string `json:"publicIp,omitempty"`
	TLSInternal bool   `json:"tlsInternal,omitempty"`
}

// ErrHostKeyChanged: a VPS respondeu com outra identidade (reinstalada ou alguém no meio).
var ErrHostKeyChanged = errors.New("a identidade desta VPS mudou desde a última vez")

func (o *DeployOptions) normalize() error {
	o.Host = strings.TrimSpace(o.Host)
	if o.Host == "" {
		return errors.New("informe o IP da VPS")
	}
	if host, port, err := net.SplitHostPort(o.Host); err == nil {
		o.Host = host
		if p, err := strconv.Atoi(port); err == nil {
			o.Port = p
		}
	}
	if o.Port == 0 {
		o.Port = 22
	}
	if o.User = strings.TrimSpace(o.User); o.User == "" {
		o.User = "root"
	}
	if o.Password == "" && o.KeyPath == "" {
		return errors.New("informe a senha ou a chave SSH da VPS")
	}
	if _, err := parseVersion(o.Version); err != nil {
		return errors.New("versão do servidor inválida")
	}
	return nil
}

func authMethods(o DeployOptions) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if o.KeyPath != "" {
		data, err := os.ReadFile(o.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("não deu para ler a chave SSH: %w", err)
		}
		var signer ssh.Signer
		if o.KeyPassphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(o.KeyPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(data)
		}
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			return nil, errors.New("a chave SSH tem senha: informe a senha da chave")
		}
		if err != nil {
			return nil, fmt.Errorf("chave SSH inválida: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if o.Password != "" {
		password := o.Password
		methods = append(methods,
			ssh.Password(password),
			// Algumas VPS só aceitam senha pelo "keyboard-interactive".
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = password
				}
				return answers, nil
			}))
	}
	return methods, nil
}

// hostKeyCallback: confia na VPS no primeiro acesso e guarda a identidade;
// depois, recusa se ela mudar.
func hostKeyCallback(path string) (ssh.HostKeyCallback, error) {
	if path == "" {
		return nil, errors.New("arquivo known_hosts não informado")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDONLY, 0o600)
	if err != nil {
		return nil, err
	}
	_ = f.Close()
	known, err := knownhosts.New(path)
	if err != nil {
		return nil, err
	}
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		err := known(hostname, remote, key)
		var keyErr *knownhosts.KeyError
		if errors.As(err, &keyErr) && len(keyErr.Want) == 0 {
			line := knownhosts.Line([]string{knownhosts.Normalize(hostname)}, key)
			f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
			if err != nil {
				return err
			}
			defer f.Close()
			_, err = f.WriteString(line + "\n")
			return err
		}
		if errors.As(err, &keyErr) {
			return ErrHostKeyChanged
		}
		return err
	}, nil
}

// remote roda comandos na VPS repassando os eventos JSON do salinha-host.
type remote struct {
	client *ssh.Client
	em     *Emitter
}

// run executa o script; linhas que são eventos vão para o app, o resto fica
// guardado para a mensagem de erro.
func (r remote) run(script string) (string, error) {
	session, err := r.client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	var stderr bytes.Buffer
	session.Stderr = &stderr
	stdout, err := session.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err := session.Start(script); err != nil {
		return "", err
	}
	var plain strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		var ev Event
		if strings.HasPrefix(line, "{") && json.Unmarshal([]byte(line), &ev) == nil && ev.Type != "" {
			// O "ready" da VPS ainda não vale: falta conferir de fora.
			if ev.Type != "ready" {
				r.em.Emit(ev)
			}
			continue
		}
		plain.WriteString(line + "\n")
	}
	err = session.Wait()
	out := strings.TrimSpace(plain.String() + stderr.String())
	if err != nil {
		return out, fmt.Errorf("%w: %s", err, tail([]byte(out)))
	}
	return out, nil
}

// shellQuote: valor seguro entre aspas simples no sh.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// installScript baixa o pacote, confere a assinatura (OpenSSL 3, como o
// site/install.sh) e troca o app/ (o serviço para antes, se já existia).
func installScript(packageURL, publicKeyPEM string) string {
	return fmt.Sprintf(`set -eu
R=%[1]s
D="$R/download"
mkdir -p "$D"
cd "$D"
if command -v curl >/dev/null 2>&1; then get() { curl -fsSL --retry 3 -o "$2" "$1"; }
else get() { wget -q -O "$2" "$1"; }; fi
get %[2]s pkg.tar.gz
get %[3]s pkg.sig
base64 -d pkg.sig > pkg.sig.bin
printf '%%s\n' %[4]s > pub.pem
openssl pkeyutl -verify -pubin -inkey pub.pem -rawin -in pkg.tar.gz -sigfile pkg.sig.bin >/dev/null
rm -rf "$R/app.new"
mkdir -p "$R/app.new"
tar -xzf pkg.tar.gz -C "$R/app.new"
test -x "$R/app.new/bin/salinha-host"
if [ -d "$R/app" ]; then
  systemctl stop salinha-server 2>/dev/null || "$R/app/bin/salinha-host" stop --root "$R" 2>/dev/null || true
  rm -rf "$R/app.prev"
  mv "$R/app" "$R/app.prev"
fi
mv "$R/app.new" "$R/app"
rm -f pkg.tar.gz pkg.sig pkg.sig.bin pub.pem
`, shellQuote(VPSRoot), shellQuote(packageURL), shellQuote(packageURL+".sig"), shellQuote(strings.TrimSpace(publicKeyPEM)))
}

// Deploy faz tudo e devolve o endereço público já conferido de fora.
func Deploy(ctx context.Context, o DeployOptions, update UpdateConfig, em *Emitter) (string, error) {
	fail := func(step string, err error) (string, error) {
		em.Step(step, "error", err.Error())
		return "", err
	}
	if err := o.normalize(); err != nil {
		return fail("connect", err)
	}
	releases := update.ReleasesURL
	if o.ReleasesURL != "" {
		releases = o.ReleasesURL
	}
	if update.PublicKeyPEM == "" {
		return fail("connect", errors.New("esta versão do app não tem a chave para conferir o servidor"))
	}

	em.Step("connect", "running", "Conectando à VPS")
	auth, err := authMethods(o)
	if err != nil {
		return fail("connect", err)
	}
	hostKeys, err := hostKeyCallback(o.KnownHosts)
	if err != nil {
		return fail("connect", err)
	}
	addr := net.JoinHostPort(o.Host, strconv.Itoa(o.Port))
	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            o.User,
		Auth:            auth,
		HostKeyCallback: hostKeys,
		Timeout:         15 * time.Second,
	})
	if err != nil {
		return fail("connect", connectError(err))
	}
	defer client.Close()
	r := remote{client: client, em: em}

	facts, err := r.run(`id -u; uname -s; uname -m; (openssl version 2>/dev/null || echo sem-openssl); (command -v systemctl >/dev/null && echo systemd || echo sem-systemd)`)
	if err != nil {
		return fail("connect", err)
	}
	if err := checkFacts(facts); err != nil {
		return fail("connect", err)
	}
	publicIP := o.PublicIP
	if publicIP == "" {
		publicIP, _, _ = net.SplitHostPort(client.RemoteAddr().String())
	}
	em.Step("connect", "done", "")

	em.Step("download", "running", "Baixando o servidor na VPS")
	file := fmt.Sprintf("salinha-server-%s-linux-x64.tar.gz", o.Version)
	packageURL := fmt.Sprintf("%s/download/v%s/%s", strings.TrimRight(releases, "/"), o.Version, file)
	if _, err := r.run(installScript(packageURL, update.PublicKeyPEM)); err != nil {
		if strings.Contains(err.Error(), "404") {
			err = fmt.Errorf("o pacote do servidor %s ainda não foi publicado", o.Version)
		}
		return fail("download", err)
	}
	em.Step("download", "done", "")

	bin := shellQuote(VPSRoot + "/app/bin/salinha-host")
	root := shellQuote(VPSRoot)
	if _, err := r.run(fmt.Sprintf("%s prepare-system --root %s", bin, root)); err != nil {
		return fail("setup", err)
	}
	setup := fmt.Sprintf("runuser -u %s -- %s setup --root %s --public-ip %s", ServiceUser, bin, root, shellQuote(publicIP))
	if o.Domain != "" {
		setup += " --domain " + shellQuote(o.Domain)
	}
	if o.AutoUpdate {
		setup += " --auto-update"
	}
	if o.TLSInternal {
		setup += " --tls-internal"
	}
	if _, err := r.run(setup); err != nil {
		return "", err // o setup já mandou o evento de erro da etapa
	}
	if _, err := r.run(fmt.Sprintf("%s finish-system --root %s", bin, root)); err != nil {
		return "", err
	}

	cfgText, err := r.run(fmt.Sprintf("cat %s", shellQuote(VPSRoot+"/data/host.json")))
	if err != nil {
		return fail("check", err)
	}
	var cfg HostConfig
	if err := json.Unmarshal([]byte(cfgText), &cfg); err != nil || cfg.Network.PublicURL == "" {
		return fail("check", errors.New("a VPS não devolveu o endereço do servidor"))
	}

	em.Step("check", "running", "Conferindo o servidor pela internet (o certificado HTTPS pode levar um minuto)")
	if err := checkFromOutside(ctx, cfg.Network.PublicURL, o.TLSInternal, 4*time.Minute); err != nil {
		return fail("check", err)
	}
	em.Step("check", "done", "")
	em.Emit(Event{Type: "ready", PublicURL: cfg.Network.PublicURL, Mode: "vps"})
	return cfg.Network.PublicURL, nil
}

// connectError traduz os erros mais comuns do SSH.
func connectError(err error) error {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrHostKeyChanged) || strings.Contains(msg, ErrHostKeyChanged.Error()):
		return errors.New("a identidade desta VPS mudou desde a última vez (ela foi reinstalada?). Por segurança, a instalação parou")
	case strings.Contains(msg, "unable to authenticate"):
		return errors.New("usuário, senha ou chave recusados pela VPS")
	case strings.Contains(msg, "i/o timeout") || strings.Contains(msg, "connection refused") || strings.Contains(msg, "no route"):
		return errors.New("não deu para conectar na VPS (confira o IP e se a porta 22 do SSH está aberta)")
	}
	return err
}

// checkFacts: root, Linux x86_64, OpenSSL 3 e systemd.
func checkFacts(out string) error {
	lines := strings.Fields(out)
	has := func(s string) bool { return strings.Contains(out, s) }
	if len(lines) == 0 || lines[0] != "0" {
		return errors.New("entre com o usuário root da VPS (o instalador precisa dele para configurar o servidor)")
	}
	if !has("Linux") {
		return errors.New("a VPS precisa ser Linux (Debian ou Ubuntu)")
	}
	if !has("x86_64") {
		return errors.New("a VPS precisa ser x86_64 (amd64); ARM ainda não é suportado")
	}
	if has("sem-openssl") || !has("OpenSSL 3") {
		return errors.New("a VPS precisa do OpenSSL 3 (Debian 12+ ou Ubuntu 22.04+)")
	}
	return nil
}

// checkFromOutside: /healthz 200 e /rtc/validate 401 (LiveKit) pelo endereço
// público, de fora da VPS, como o deploy.yml oficial confere.
func checkFromOutside(ctx context.Context, publicURL string, insecure bool, wait time.Duration) error {
	client := &http.Client{
		Timeout: 10 * time.Second,
		// Certificado da CA interna do Caddy: só nos testes.
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: insecure}}, //nolint:gosec
	}
	status := func(path string) (int, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, publicURL+path, nil)
		if err != nil {
			return 0, err
		}
		res, err := client.Do(req)
		if err != nil {
			return 0, err
		}
		_, _ = io.Copy(io.Discard, res.Body)
		_ = res.Body.Close()
		return res.StatusCode, nil
	}
	deadline := time.Now().Add(wait)
	var last error
	for time.Now().Before(deadline) {
		code, err := status("/healthz")
		if err == nil && code == http.StatusOK {
			if code, err := status("/rtc/validate"); err == nil && code == http.StatusUnauthorized {
				return nil
			} else if err == nil {
				last = fmt.Errorf("/rtc respondeu %d (esperado 401 do LiveKit)", code)
			}
		} else if err != nil {
			last = err
		} else {
			last = fmt.Errorf("/healthz respondeu %d", code)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return fmt.Errorf("o servidor não respondeu em %s (portas 80/443 bloqueadas no painel do provedor?): %v", publicURL, last)
}
