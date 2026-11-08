package linkpreview

import (
	"bytes"
	"net/url"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// Leitura das tags da página (ADR 0060): og:title (ou <title>),
// og:description (ou meta description), og:site_name, og:image e
// theme-color. Único arquivo que conhece o x/net/html.

const (
	maxTitle       = 256
	maxDescription = 350
	maxSiteName    = 100
)

// Parsed: o que a página diz de si, já limpo e cortado.
type Parsed struct {
	Title       string
	Description string
	SiteName    string
	// ImageURL: absoluta (resolvida contra a URL final), só http/https.
	ImageURL string
	// Color: #rgb ou #rrggbb em minúsculas, ou vazio.
	Color string
}

// Empty: sem título, descrição nem imagem não há cartão.
func (p Parsed) Empty() bool {
	return p.Title == "" && p.Description == "" && p.ImageURL == ""
}

// Parse lê as tags até o </head> (ou o fim do que foi baixado).
func Parse(body []byte, base *url.URL) Parsed {
	c := collect(body)
	return Parsed{
		Title:       clip(first(c.props["og:title"], c.title), maxTitle),
		Description: clip(first(c.props["og:description"], c.names["description"]), maxDescription),
		SiteName:    clip(c.props["og:site_name"], maxSiteName),
		ImageURL:    resolveImage(base, first(c.props["og:image"], c.props["og:image:url"], c.props["og:image:secure_url"])),
		Color:       safeColor(c.names["theme-color"]),
	}
}

// collected: as <meta property> (og:*), as <meta name> e o primeiro <title>
// fora de <svg> (ícones trazem <title> próprio).
type collected struct {
	props    map[string]string
	names    map[string]string
	title    string
	inTitle  bool
	svgDepth int
}

func collect(body []byte) *collected {
	c := &collected{props: map[string]string{}, names: map[string]string{}}
	z := html.NewTokenizer(bytes.NewReader(body))
	for {
		switch z.Next() {
		case html.ErrorToken:
			return c
		case html.StartTagToken:
			c.start(z, true)
		case html.SelfClosingTagToken:
			c.start(z, false)
		case html.EndTagToken:
			if c.end(z) {
				return c
			}
		case html.TextToken:
			if c.inTitle {
				c.title += string(z.Text())
			}
		}
	}
}

func (c *collected) start(z *html.Tokenizer, opens bool) {
	name, hasAttr := z.TagName()
	switch string(name) {
	case "meta":
		if hasAttr {
			c.meta(z)
		}
	case "title":
		c.inTitle = opens && c.svgDepth == 0 && c.title == ""
	case "svg":
		if opens {
			c.svgDepth++
		}
	}
}

// end trata a tag de fechamento; true no </head> (para de ler).
func (c *collected) end(z *html.Tokenizer) bool {
	name, _ := z.TagName()
	switch string(name) {
	case "head":
		return true
	case "title":
		c.inTitle = false
	case "svg":
		c.svgDepth = max(0, c.svgDepth-1)
	}
	return false
}

// meta guarda a primeira ocorrência de cada property/name.
func (c *collected) meta(z *html.Tokenizer) {
	var property, name, content string
	for more := true; more; {
		var key, val []byte
		key, val, more = z.TagAttr()
		switch string(key) {
		case "property":
			property = strings.ToLower(strings.TrimSpace(string(val)))
		case "name":
			name = strings.ToLower(strings.TrimSpace(string(val)))
		case "content":
			content = string(val)
		}
	}
	keep(c.props, property, content)
	keep(c.names, name, content)
}

func keep(m map[string]string, key, value string) {
	if _, seen := m[key]; key != "" && !seen {
		m[key] = value
	}
}

func first(values ...string) string {
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

// clip junta os espaços (quebras de linha viram um espaço) e corta em max caracteres.
func clip(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return strings.TrimSpace(string(runes[:max]))
}

func resolveImage(base *url.URL, raw string) string {
	if raw == "" {
		return ""
	}
	ref, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if base != nil {
		ref = base.ResolveReference(ref)
	}
	if ref.Scheme != "http" && ref.Scheme != "https" || ref.Host == "" {
		return ""
	}
	return ref.String()
}

var hexColor = regexp.MustCompile(`^#(?:[0-9a-f]{3}|[0-9a-f]{6})$`)

// safeColor: só #rgb/#rrggbb (vai para o style do cartão, nunca CSS arbitrário).
func safeColor(raw string) string {
	c := strings.ToLower(strings.TrimSpace(raw))
	if !hexColor.MatchString(c) {
		return ""
	}
	return c
}
