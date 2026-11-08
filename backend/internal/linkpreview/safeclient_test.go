package linkpreview

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
)

// clientFor: o cliente blindado de verdade, com uma única exceção — o
// endereço do servidor de teste (que escuta em 127.0.0.1, porta aleatória).
// Todo o resto passa pela regra de produção.
func clientFor(t *testing.T, servers ...*httptest.Server) *SafeClient {
	t.Helper()
	allowed := map[netip.AddrPort]bool{}
	var ports []uint16
	for _, s := range servers {
		u, _ := url.Parse(s.URL)
		ap := netip.MustParseAddrPort(u.Host)
		allowed[ap] = true
		ports = append(ports, ap.Port())
	}
	return newSafeClient(func(ap netip.AddrPort) error {
		if allowed[ap] {
			return nil
		}
		return checkAddr(ap)
	}, ports...)
}

func TestCheckAddrRecusaRedeInterna(t *testing.T) {
	blocked := []string{
		"127.0.0.1:80", "10.1.2.3:443", "172.16.0.1:80", "192.168.0.10:80",
		"169.254.169.254:80", "100.64.0.1:80", "0.0.0.0:80", "224.0.0.1:80",
		"255.255.255.255:80", "[::1]:443", "[fc00::1]:443", "[fe80::1]:443",
		"[::ffff:127.0.0.1]:80", "[::ffff:10.0.0.1]:443", "[::]:80",
		// IP público, porta fora de 80/443.
		"93.184.215.14:8080", "93.184.215.14:22",
	}
	for _, raw := range blocked {
		if err := checkAddr(netip.MustParseAddrPort(raw)); !errors.Is(err, ErrBlocked) {
			t.Errorf("checkAddr(%s) = %v, want ErrBlocked", raw, err)
		}
	}
	for _, raw := range []string{"93.184.215.14:443", "93.184.215.14:80", "[2606:4700::1111]:443"} {
		if err := checkAddr(netip.MustParseAddrPort(raw)); err != nil {
			t.Errorf("checkAddr(%s) = %v, want nil", raw, err)
		}
	}
}

func TestFetchHTMLRecusaEnderecosInternosNoDial(t *testing.T) {
	c := NewSafeClient()
	for _, raw := range []string{
		"http://127.0.0.1/",
		"http://localhost/",
		"http://10.0.0.1/",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/",
		"http://[::ffff:127.0.0.1]/",
	} {
		if _, err := c.FetchHTML(context.Background(), raw); !errors.Is(err, ErrBlocked) {
			t.Errorf("FetchHTML(%s) = %v, want ErrBlocked", raw, err)
		}
	}
}

func TestFetchHTMLRecusaEsquemaPortaEUsuario(t *testing.T) {
	c := NewSafeClient()
	for _, raw := range []string{
		"ftp://example.com/",
		"file:///etc/passwd",
		"http://example.com:8080/",
		"http://user:senha@example.com/",
		"http:///sem-host",
	} {
		if _, err := c.FetchHTML(context.Background(), raw); !errors.Is(err, ErrBlocked) {
			t.Errorf("FetchHTML(%s) = %v, want ErrBlocked", raw, err)
		}
	}
}

func TestFetchHTMLRedirecionamentoParaIPInternoERecusado(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://10.0.0.1/admin", http.StatusFound)
	}))
	defer srv.Close()

	if _, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL); !errors.Is(err, ErrBlocked) {
		t.Fatalf("err = %v, want ErrBlocked", err)
	}
}

func TestFetchHTMLRedirecionamentoParaPortaProibida(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://example.com:8080/", http.StatusFound)
	}))
	defer srv.Close()

	if _, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL); !errors.Is(err, ErrBlocked) {
		t.Fatalf("err = %v, want ErrBlocked", err)
	}
}

func TestFetchHTMLAteTresRedirecionamentos(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := len(r.URL.Path) - 1 // "/", "/a", "/aa"...
		if r.URL.Path == "/fim" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<title>ok</title>"))
			return
		}
		if n >= 3 {
			http.Redirect(w, r, "/fim", http.StatusFound)
			return
		}
		http.Redirect(w, r, r.URL.Path+"a", http.StatusFound)
	}))
	defer srv.Close()
	c := clientFor(t, srv)

	// "/aa" → "/aaa" → "/fim": 2 redirecionamentos.
	page, err := c.FetchHTML(context.Background(), srv.URL+"/aa")
	if err != nil {
		t.Fatalf("2 redirecionamentos: %v", err)
	}
	if page.URL.Path != "/fim" {
		t.Errorf("URL final = %s, want /fim", page.URL)
	}
	// "/" → "/a" → "/aa" → "/aaa" → "/fim": 4 redirecionamentos.
	if _, err := c.FetchHTML(context.Background(), srv.URL+"/"); !errors.Is(err, ErrTooManyRedirects) {
		t.Errorf("4 redirecionamentos: err = %v, want ErrTooManyRedirects", err)
	}
}

func TestFetchHTMLLeNoMaximo1MB(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(strings.Repeat("a", 2<<20)))
	}))
	defer srv.Close()

	page, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Body) != maxHTMLBytes {
		t.Errorf("leu %d bytes, want %d", len(page.Body), maxHTMLBytes)
	}
}

func TestFetchHTMLSoAceitaHTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"title":"x"}`))
	}))
	defer srv.Close()

	if _, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL); !errors.Is(err, ErrNotHTML) {
		t.Fatalf("err = %v, want ErrNotHTML", err)
	}
}

func TestFetchHTMLStatusDeErro(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "sumiu", http.StatusNotFound)
	}))
	defer srv.Close()

	if _, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL); err == nil {
		t.Fatal("404 tem que dar erro")
	}
}

func TestFetchHTMLMandaUserAgentProprio(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.UserAgent()
		w.Header().Set("Content-Type", "text/html")
	}))
	defer srv.Close()

	if _, err := clientFor(t, srv).FetchHTML(context.Background(), srv.URL); err != nil {
		t.Fatal(err)
	}
	if got != userAgent {
		t.Errorf("User-Agent = %q, want %q", got, userAgent)
	}
}

func TestOpenDevolveCorpoDaImagem(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("\x89PNG\r\n\x1a\nresto"))
	}))
	defer srv.Close()

	body, err := clientFor(t, srv).Open(context.Background(), srv.URL+"/img.png")
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()
	buf := make([]byte, 4)
	if _, err := body.Read(buf); err != nil || string(buf[1:4]) != "PNG" {
		t.Errorf("corpo = %q, err = %v", buf, err)
	}
	if _, err := NewSafeClient().Open(context.Background(), "http://169.254.169.254/x.png"); !errors.Is(err, ErrBlocked) {
		t.Errorf("Open em IP interno: err = %v, want ErrBlocked", err)
	}
}
