package gifs

import (
	"net/url"
	"regexp"
	"strings"
)

const maxURLLen = 500

// providerOf diz de qual provedor é a URL de mídia ("" se não for de nenhum:
// só https e só os hosts que cada provedor serve). Os hosts do GIPHY ficam
// para as mensagens e favoritos antigos.
func providerOf(raw string) string {
	if raw == "" || len(raw) > maxURLLen {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return ""
	}
	host := u.Hostname()
	switch {
	case isDomain(host, "giphy.com"):
		return ProviderGiphy
	case isDomain(host, "klipy.com"):
		return ProviderKlipy
	}
	return ""
}

func isDomain(host, domain string) bool {
	return host == domain || strings.HasSuffix(host, "."+domain)
}

// klipyHash: a KLIPY serve cada GIF em `/ii/<hash de 32 hex>/<x>/<y>/<arquivo>`,
// igual para todos os tamanhos. O hash é o id do favorito: dá para tirá-lo da
// URL de uma mensagem (o frontend faz o mesmo, em lib/gifFavorites.ts).
var klipyHash = regexp.MustCompile(`^/[^/]+/([0-9a-f]{32})/`)

func klipyIDFromURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if m := klipyHash.FindStringSubmatch(u.Path); m != nil {
		return m[1]
	}
	return ""
}
