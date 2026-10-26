package hostkit

import (
	"crypto/ed25519"
	"crypto/rand"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestVPSNetwork(t *testing.T) {
	n, err := vpsNetwork(VPSOptions{PublicIP: "74.0.5.252"})
	if err != nil {
		t.Fatal(err)
	}
	if n.PublicURL != "https://74-0-5-252.sslip.io" || n.NodeIP != "74.0.5.252" || n.Mode != "vps" {
		t.Fatalf("%+v", n)
	}
	n, err = vpsNetwork(VPSOptions{PublicIP: "74.0.5.252", Domain: " Salinha.Exemplo.com. "})
	if err != nil || n.PublicURL != "https://salinha.exemplo.com" || n.Domain != "salinha.exemplo.com" {
		t.Fatalf("%+v %v", n, err)
	}
	for _, bad := range []VPSOptions{
		{PublicIP: ""},
		{PublicIP: "192.168.0.10"}, // IP de rede local não é público
		{PublicIP: "100.64.1.1"},   // CGNAT
		{PublicIP: "74.0.5.252", Domain: "não é domínio"},
		{PublicIP: "74.0.5.252", Domain: "http://x.com"},
	} {
		if _, err := vpsNetwork(bad); err == nil {
			t.Errorf("deveria recusar %+v", bad)
		}
	}
	// Testes locais (CA interna) aceitam IP de rede local.
	if _, err := vpsNetwork(VPSOptions{PublicIP: "127.0.0.1", TLSInternal: true}); err != nil {
		t.Fatal(err)
	}
}

func TestRenderCaddyfile(t *testing.T) {
	l := Layout{Root: "/opt/salinha-server"}
	text := RenderCaddyfile(l, Network{PublicURL: "https://74-0-5-252.sslip.io"}, DefaultPorts, false)
	for _, want := range []string{
		"74-0-5-252.sslip.io {",
		"handle /rtc* {\n\t\treverse_proxy 127.0.0.1:7880",
		"reverse_proxy 127.0.0.1:8080 {",
		"keepalive off",
		"handle /updates/*",
		"admin 127.0.0.1:2019",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("Caddyfile sem %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "tls internal") {
		t.Fatal("tls internal só nos testes")
	}
	if !strings.Contains(RenderCaddyfile(l, Network{PublicURL: "https://x.test"}, DefaultPorts, true), "tls internal") {
		t.Fatal("faltou tls internal")
	}
}

func TestPreStartAppliesAndConfirms(t *testing.T) {
	l := Layout{Root: t.TempDir()}
	mkApp := func(dir, marker string) {
		if err := os.MkdirAll(filepath.Join(dir, "bin"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "VERSION"), []byte(marker), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	version := func() string {
		data, _ := os.ReadFile(filepath.Join(l.App(), "VERSION"))
		return string(data)
	}
	mkApp(l.App(), "velha")
	mkApp(l.NewApp(), "nova")
	if err := writePending(l, pendingUpdate{Version: "0.8.0", Phase: "staged"}); err != nil {
		t.Fatal(err)
	}

	if err := PreStart(l); err != nil || version() != "nova" {
		t.Fatalf("aplicar: %v, app=%s", err, version())
	}
	ConfirmUpdate(l)
	if _, ok := readPending(l); ok {
		t.Fatal("confirmada, a troca não fica pendente")
	}
	if err := PreStart(l); err != nil || version() != "nova" {
		t.Fatal("sem pendência, o pre-start não mexe em nada")
	}
}

func TestPreStartRollsBackAfterFailedStarts(t *testing.T) {
	l := Layout{Root: t.TempDir()}
	for dir, marker := range map[string]string{l.App(): "velha", l.NewApp(): "nova"} {
		_ = os.MkdirAll(dir, 0o755)
		_ = os.WriteFile(filepath.Join(dir, "VERSION"), []byte(marker), 0o644)
	}
	_ = writePending(l, pendingUpdate{Version: "0.8.0", Phase: "staged"})
	version := func() string {
		data, _ := os.ReadFile(filepath.Join(l.App(), "VERSION"))
		return string(data)
	}

	// 1ª partida: troca. A nova nunca confirma (cai antes de ficar no ar).
	for i := 0; i < maxUpdateAttempts; i++ {
		if err := PreStart(l); err != nil || version() != "nova" {
			t.Fatalf("partida %d: %v app=%s", i+1, err, version())
		}
	}
	// Mais uma partida sem confirmar: volta para a anterior.
	if err := PreStart(l); err != nil || version() != "velha" {
		t.Fatalf("voltar: %v app=%s", err, version())
	}
	if _, ok := readPending(l); ok {
		t.Fatal("depois de voltar não fica pendência")
	}
}

func TestHostKeyTrustOnFirstUse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "known_hosts")
	cb, err := hostKeyCallback(path)
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	key, _ := ssh.NewPublicKey(pub)
	addr := &net.TCPAddr{IP: net.ParseIP("74.0.5.252"), Port: 22}
	if err := cb("74.0.5.252:22", addr, key); err != nil {
		t.Fatalf("primeiro acesso: %v", err)
	}
	cb, _ = hostKeyCallback(path)
	if err := cb("74.0.5.252:22", addr, key); err != nil {
		t.Fatalf("mesma chave: %v", err)
	}
	otherPub, _, _ := ed25519.GenerateKey(rand.Reader)
	other, _ := ssh.NewPublicKey(otherPub)
	if err := cb("74.0.5.252:22", addr, other); err != ErrHostKeyChanged {
		t.Fatalf("chave diferente deveria parar: %v", err)
	}
}

func TestCheckFacts(t *testing.T) {
	ok := "0\nLinux\nx86_64\nOpenSSL 3.0.15 3 Sep 2024\nsystemd\n"
	if err := checkFacts(ok); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{
		strings.Replace(ok, "0\n", "1000\n", 1),
		strings.Replace(ok, "x86_64", "aarch64", 1),
		strings.Replace(ok, "OpenSSL 3.0.15", "OpenSSL 1.1.1w", 1),
		strings.Replace(ok, "OpenSSL 3.0.15 3 Sep 2024", "sem-openssl", 1),
	} {
		if err := checkFacts(bad); err == nil {
			t.Errorf("deveria recusar:\n%s", bad)
		}
	}
}

func TestDeployOptionsNormalize(t *testing.T) {
	o := DeployOptions{Host: " 74.0.5.252:2222 ", Password: "x", Version: "0.7.0"}
	if err := o.normalize(); err != nil || o.Host != "74.0.5.252" || o.Port != 2222 || o.User != "root" {
		t.Fatalf("%+v %v", o, err)
	}
	if err := (&DeployOptions{Host: "1.2.3.4", Version: "0.7.0"}).normalize(); err == nil {
		t.Fatal("sem senha nem chave tem que falhar")
	}
}

func TestShellQuoteAndInstallScript(t *testing.T) {
	if got := shellQuote(`a'b`); got != `'a'\''b'` {
		t.Fatal(got)
	}
	s := installScript("https://github.com/o/r/releases/download/v0.7.0/p.tar.gz", "-----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----\n")
	for _, want := range []string{
		"openssl pkeyutl -verify -pubin -inkey pub.pem -rawin",
		"'https://github.com/o/r/releases/download/v0.7.0/p.tar.gz.sig'",
		`mv "$R/app" "$R/app.prev"`,
		"R='/opt/salinha-server'",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("script sem %q", want)
		}
	}
}
