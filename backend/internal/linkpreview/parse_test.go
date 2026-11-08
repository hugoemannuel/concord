package linkpreview

import (
	"net/url"
	"os"
	"strings"
	"testing"
	"unicode/utf8"
)

func parseFile(t *testing.T, name, base string) Parsed {
	t.Helper()
	body, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(base)
	return Parse(body, u)
}

func TestParseOpenGraphCompleto(t *testing.T) {
	got := parseFile(t, "og_completo.html", "https://www.buser.com.br/onibus/sao-paulo")
	want := Parsed{
		Title:       "Passagens de ônibus & viagens | Buser",
		Description: "Viaje com conforto pagando até 60% menos.",
		SiteName:    "Buser",
		ImageURL:    "https://www.buser.com.br/static/capa.png",
		Color:       "#e0218a",
	}
	if got != want {
		t.Errorf("Parse =\n%+v\nwant\n%+v", got, want)
	}
}

func TestParseSoTitle(t *testing.T) {
	got := parseFile(t, "so_title.html", "https://exemplo.com/")
	if got.Title != "Só o título" || got.Description != "" || got.ImageURL != "" {
		t.Errorf("Parse = %+v, want só o título (sem o <title> do svg)", got)
	}
	if got.Empty() {
		t.Error("com título não é vazio")
	}
}

func TestParseSemNadaEVazio(t *testing.T) {
	got := parseFile(t, "sem_nada.html", "https://exemplo.com/")
	if !got.Empty() {
		t.Errorf("Parse = %+v, want vazio (o <title> do svg não conta)", got)
	}
}

func TestParseMetaDescriptionCorInvalidaImagemPerigosa(t *testing.T) {
	got := parseFile(t, "meta_description.html", "https://exemplo.com/a/")
	if got.Description != "Descrição pela meta comum" {
		t.Errorf("Description = %q", got.Description)
	}
	if got.Color != "" {
		t.Errorf("Color = %q, want vazio (só #rgb/#rrggbb)", got.Color)
	}
	if got.ImageURL != "" {
		t.Errorf("ImageURL = %q, want vazio (só http/https)", got.ImageURL)
	}
}

func TestParseCortaTextosLongos(t *testing.T) {
	long := strings.Repeat("é", 500)
	html := `<meta property="og:title" content="` + long + `"><meta property="og:description" content="` + long + `"><meta property="og:site_name" content="` + long + `">`
	u, _ := url.Parse("https://exemplo.com/")
	got := Parse([]byte(html), u)
	for name, c := range map[string]struct {
		s   string
		max int
	}{"title": {got.Title, 256}, "description": {got.Description, 350}, "site": {got.SiteName, 100}} {
		if n := utf8.RuneCountInString(c.s); n != c.max {
			t.Errorf("%s com %d caracteres, want %d", name, n, c.max)
		}
	}
}

func TestSafeColor(t *testing.T) {
	cases := map[string]string{
		"#FFF": "#fff", "#a1b2c3": "#a1b2c3", " #ABCDEF ": "#abcdef",
		"red": "", "#abcd": "", "#ggg": "", "rgb(1,2,3)": "", "#fff;background:url(x)": "",
	}
	for in, want := range cases {
		if got := safeColor(in); got != want {
			t.Errorf("safeColor(%q) = %q, want %q", in, got, want)
		}
	}
}
