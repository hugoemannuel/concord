package linkpreview

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"syscall"
	"time"
)

// Cliente HTTP blindado contra SSRF: quem manda o link escolhe a URL, então o
// servidor não pode virar ponte para a rede interna da VPS (banco, LiveKit,
// metadados da nuvem em 169.254.169.254...). A regra de IP roda no
// net.Dialer.Control, sobre o endereço de fato conectado: um DNS que responde
// público na checagem e interno na conexão (DNS rebinding) não passa.

var (
	// ErrBlocked: URL ou endereço fora da regra (esquema, porta, usuário, IP interno).
	ErrBlocked          = errors.New("endereço bloqueado para a prévia")
	ErrTooManyRedirects = errors.New("redirecionamentos demais")
	ErrNotHTML          = errors.New("a página não é HTML")
	ErrBadStatus        = errors.New("a página respondeu com erro")
)

const (
	userAgent    = "SalinhaBot/1.0 (+prévia de links)"
	fetchTimeout = 5 * time.Second
	maxRedirects = 3
	maxHTMLBytes = 1 << 20
)

// blockedPrefixes: faixas que o IsGlobalUnicast/IsPrivate não pegam (CGNAT,
// "esta rede", reservadas, documentação e o NAT64, que leva a IPv4 qualquer).
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("2001:db8::/32"),
}

// defaultPorts: só as portas web padrão.
var defaultPorts = map[uint16]bool{80: true, 443: true}

// checkIP recusa loopback, privado (RFC 1918, fc00::/7), link-local
// (169.254.0.0/16, fe80::/10), multicast, não especificado, broadcast e as
// faixas de blockedPrefixes; IPv4-mapeado (::ffff:a.b.c.d) vale como o IPv4.
func checkIP(ip netip.Addr) error {
	ip = ip.Unmap().WithZone("")
	if !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return fmt.Errorf("%w: %s", ErrBlocked, ip)
	}
	for _, p := range blockedPrefixes {
		if p.Contains(ip) {
			return fmt.Errorf("%w: %s", ErrBlocked, ip)
		}
	}
	return nil
}

// checkAddr: a regra de produção para cada conexão (IP público e porta 80/443).
func checkAddr(ap netip.AddrPort) error {
	if !defaultPorts[ap.Port()] {
		return fmt.Errorf("%w: porta %d", ErrBlocked, ap.Port())
	}
	return checkIP(ap.Addr())
}

// SafeClient busca páginas e imagens de terceiros com a regra acima.
type SafeClient struct {
	http  *http.Client
	ports map[uint16]bool
}

func NewSafeClient() *SafeClient { return newSafeClient(checkAddr) }

// newSafeClient: check decide cada conexão (o teste abre exceção para o
// httptest.Server); extraPorts soma portas aceitas na URL.
func newSafeClient(check func(netip.AddrPort) error, extraPorts ...uint16) *SafeClient {
	ports := map[uint16]bool{80: true, 443: true}
	for _, p := range extraPorts {
		ports[p] = true
	}
	c := &SafeClient{ports: ports}
	dialer := &net.Dialer{
		Timeout: fetchTimeout,
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil {
				return fmt.Errorf("%w: %s", ErrBlocked, address)
			}
			return check(ap)
		},
	}
	c.http = &http.Client{
		Timeout: fetchTimeout,
		Transport: &http.Transport{
			// Sem proxy: com proxy o Control veria o IP do proxy, não o do site.
			Proxy:                 nil,
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   fetchTimeout,
			ResponseHeaderTimeout: fetchTimeout,
			MaxIdleConns:          16,
			IdleConnTimeout:       30 * time.Second,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > maxRedirects {
				return ErrTooManyRedirects
			}
			return c.checkURL(req.URL)
		},
	}
	return c
}

// checkURL: http/https, sem usuário na URL, com host e porta permitida.
func (c *SafeClient) checkURL(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" || u.User != nil || u.Hostname() == "" {
		return fmt.Errorf("%w: %s", ErrBlocked, u.Redacted())
	}
	if p := u.Port(); p != "" {
		n, err := strconv.ParseUint(p, 10, 16)
		if err != nil || !c.ports[uint16(n)] {
			return fmt.Errorf("%w: porta %s", ErrBlocked, p)
		}
	}
	return nil
}

// get faz o GET já conferido; resposta fora de 2xx é ErrBadStatus.
func (c *SafeClient) get(ctx context.Context, raw, accept string) (*http.Response, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("%w: url inválida", ErrBlocked)
	}
	if err := c.checkURL(u); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBlocked, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", accept)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		resp.Body.Close()
		return nil, fmt.Errorf("%w: %d", ErrBadStatus, resp.StatusCode)
	}
	return resp, nil
}

// Page: o começo do HTML (no máximo 1 MB) e a URL final, depois dos redirecionamentos.
type Page struct {
	Body []byte
	URL  *url.URL
}

// FetchHTML busca a página; só aceita text/html e lê no máximo 1 MB.
func (c *SafeClient) FetchHTML(ctx context.Context, raw string) (Page, error) {
	resp, err := c.get(ctx, raw, "text/html")
	if err != nil {
		return Page{}, err
	}
	defer resp.Body.Close()
	if mt, _, err := mime.ParseMediaType(resp.Header.Get("Content-Type")); err != nil || mt != "text/html" {
		return Page{}, ErrNotHTML
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHTMLBytes))
	if err != nil {
		return Page{}, err
	}
	return Page{Body: body, URL: resp.Request.URL}, nil
}

// Open busca uma imagem; quem chama limita o tamanho e fecha o corpo.
func (c *SafeClient) Open(ctx context.Context, raw string) (io.ReadCloser, error) {
	resp, err := c.get(ctx, raw, "image/*")
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}
