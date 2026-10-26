package hostkit

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"
	"time"
)

func TestParseManifest(t *testing.T) {
	m, err := ParseManifest("version: 0.7.0\nwindows: salinha-server-0.7.0-windows-x64.zip\nwindows_sha512: abc\nlinux: 'salinha-server-0.7.0-linux-x64.tar.gz'\n")
	if err != nil {
		t.Fatal(err)
	}
	if m.Version != "0.7.0" || m.Files["windows"] != "salinha-server-0.7.0-windows-x64.zip" ||
		m.Sha512["windows"] != "abc" || m.Files["linux"] != "salinha-server-0.7.0-linux-x64.tar.gz" {
		t.Fatalf("%+v", m)
	}
	if _, err := ParseManifest("windows: x.zip\n"); err == nil {
		t.Fatal("sem versão tem que falhar")
	}
}

func TestNewer(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{
		{"0.7.0", "0.6.9", true},
		{"0.10.0", "0.9.9", true},
		{"1.0.0", "0.99.99", true},
		{"0.7.0", "0.7.0", false},
		{"0.6.9", "0.7.0", false},
		{"lixo", "0.7.0", false},
		{"0.7.0", "dev", true},
	} {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

func TestInUpdateWindow(t *testing.T) {
	at := func(h int) time.Time { return time.Date(2026, 10, 26, h, 30, 0, 0, time.Local) }
	if inUpdateWindow(at(2)) || !inUpdateWindow(at(3)) || !inUpdateWindow(at(5)) || inUpdateWindow(at(6)) {
		t.Fatal("janela é das 3h às 6h")
	}
}

func TestVerifyPackage(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKIXPublicKey(pub)
	pubPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	data := []byte("pacote do servidor")
	sig := base64.StdEncoding.EncodeToString(ed25519.Sign(priv, data))
	sum := sha512.Sum512(data)
	sha := base64.StdEncoding.EncodeToString(sum[:])

	if err := VerifyPackage(data, sha, sig, pubPEM); err != nil {
		t.Fatalf("pacote válido recusado: %v", err)
	}
	if err := VerifyPackage([]byte("outro"), "", sig, pubPEM); err == nil {
		t.Fatal("assinatura de outro conteúdo aceita")
	}
	if err := VerifyPackage(data, "errado", sig, pubPEM); err == nil {
		t.Fatal("sha512 errado aceito")
	}
	_, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	if err := VerifyPackage(data, "", base64.StdEncoding.EncodeToString(ed25519.Sign(otherPriv, data)), pubPEM); err == nil {
		t.Fatal("assinatura de outra chave aceita")
	}
}
