package user

import (
	"errors"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/profiletheme"
)

func strPtr(s string) *string { return &s }

func validInput() ProfileInput {
	return ProfileInput{DisplayName: "Mugis"}
}

func TestValidateProfileLimits(t *testing.T) {
	cases := []struct {
		name string
		edit func(*ProfileInput)
		ok   bool
	}{
		{"mínimo", func(*ProfileInput) {}, true},
		{"nome vazio", func(in *ProfileInput) { in.DisplayName = "" }, false},
		{"nome só espaços", func(in *ProfileInput) { in.DisplayName = "   " }, false},
		{"nome com 32", func(in *ProfileInput) { in.DisplayName = strings.Repeat("a", 32) }, true},
		{"nome com 33", func(in *ProfileInput) { in.DisplayName = strings.Repeat("a", 33) }, false},
		{"nome com zero-width", func(in *ProfileInput) { in.DisplayName = "\U0000200b" }, false},
		{"nome com NUL", func(in *ProfileInput) { in.DisplayName = "a\x00b" }, false},
		{"nome com bidi override", func(in *ProfileInput) { in.DisplayName = "a\U0000202eb" }, false},
		{"nome com hangul filler", func(in *ProfileInput) { in.DisplayName = "\U00003164" }, false},
		{"nome com quebra de linha", func(in *ProfileInput) { in.DisplayName = "a\nb" }, false},
		{"nome com família em emoji", func(in *ProfileInput) { in.DisplayName = "👨\U0000200d👩\U0000200d👧" }, true},
		{"bio com 190 com acento e emoji", func(in *ProfileInput) { in.Bio = strings.Repeat("ç", 189) + "🎮" }, true},
		{"bio com 191", func(in *ProfileInput) { in.Bio = strings.Repeat("a", 191) }, false},
		{"pronomes com 41", func(in *ProfileInput) { in.Pronouns = strings.Repeat("a", 41) }, false},
		{"nota com 128", func(in *ProfileInput) { in.StatusText = strings.Repeat("a", 128) }, true},
		{"nota com 129", func(in *ProfileInput) { in.StatusText = strings.Repeat("a", 129) }, false},
		{"cor curta", func(in *ProfileInput) { in.BannerColor = strPtr("#12345") }, false},
		{"cor por nome", func(in *ProfileInput) { in.BannerColor = strPtr("red") }, false},
		{"cor válida", func(in *ProfileInput) { in.BannerColor = strPtr("#A1b2C3") }, true},
		{"cor vazia vira nula", func(in *ProfileInput) { in.BannerColor = strPtr("") }, true},
		{"link steam", func(in *ProfileInput) {
			in.Links = []ProfileLink{{URL: "https://steamcommunity.com/id/mugis"}}
		}, true},
		{"seis links", func(in *ProfileInput) {
			for i := range 6 {
				in.Links = append(in.Links, ProfileLink{URL: "https://site.com/" + strings.Repeat("a", i+1)})
			}
		}, false},
		{"javascript", func(in *ProfileInput) { in.Links = []ProfileLink{{URL: "javascript:alert(1)"}} }, false},
		{"ftp", func(in *ProfileInput) { in.Links = []ProfileLink{{URL: "ftp://x.com"}} }, false},
		{"sem host", func(in *ProfileInput) { in.Links = []ProfileLink{{URL: "https://"}} }, false},
		{"link vazio", func(in *ProfileInput) { in.Links = []ProfileLink{{URL: " "}} }, false},
		{"link enorme", func(in *ProfileInput) {
			in.Links = []ProfileLink{{URL: "https://a.com/" + strings.Repeat("a", 250)}}
		}, false},
		{"link repetido", func(in *ProfileInput) {
			in.Links = []ProfileLink{{URL: "https://twitch.tv/mugis"}, {URL: "https://TWITCH.tv/mugis"}}
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := validInput()
			tc.edit(&in)
			_, err := ValidateProfile(in)
			if tc.ok && err != nil {
				t.Fatalf("erro inesperado: %v", err)
			}
			if !tc.ok && !errors.Is(err, ErrInvalidProfile) {
				t.Fatalf("err = %v, want ErrInvalidProfile", err)
			}
		})
	}
}

func TestValidateProfileNormalizes(t *testing.T) {
	out, err := ValidateProfile(ProfileInput{
		DisplayName: "  Mugis  ",
		Bio:         " oi \n",
		BannerColor: strPtr("#ABCDEF"),
		Links:       []ProfileLink{{URL: " https://twitch.tv/mugis "}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.DisplayName != "Mugis" || out.Bio != "oi" {
		t.Fatalf("não tirou os espaços: %+v", out)
	}
	if out.BannerColor == nil || *out.BannerColor != "#abcdef" {
		t.Fatalf("cor = %v", out.BannerColor)
	}
	if len(out.Links) != 1 || out.Links[0].URL != "https://twitch.tv/mugis" {
		t.Fatalf("links = %+v", out.Links)
	}

	empty, _ := ValidateProfile(validInput())
	if empty.Links == nil {
		t.Fatal("links nunca podem ser nil (o banco guarda [])")
	}
}

func TestEffectiveStatus(t *testing.T) {
	cases := []struct {
		chosen    string
		connected bool
		want      string
	}{
		{StatusOnline, true, StatusOnline},
		{StatusIdle, true, StatusIdle},
		{StatusDND, true, StatusDND},
		{StatusInvisible, true, StatusOffline},
		{StatusDND, false, StatusOffline},
		{"", true, StatusOnline},
	}
	for _, tc := range cases {
		if got := EffectiveStatus(tc.chosen, tc.connected); got != tc.want {
			t.Errorf("EffectiveStatus(%q, %v) = %q, want %q", tc.chosen, tc.connected, got, tc.want)
		}
	}
}

func TestProfileMediaURL(t *testing.T) {
	id := "6f1c1f43-6f4e-4a3c-9a52-2f8d8c1f0c11"
	if got := profileMediaURL(id, false); got != "/api/profile-media/"+id {
		t.Fatalf("url = %q", got)
	}
	animated := profileMediaURL(id, true)
	if animated != "/api/profile-media/a_"+id {
		t.Fatalf("url animada = %q", animated)
	}
	if got, ok := mediaIDFromURL(&animated); !ok || got != id {
		t.Fatalf("mediaIDFromURL = %q, %v", got, ok)
	}
	for _, bad := range []string{"../etc/passwd", "a_nada", "6F1C1F43-6F4E-4A3C-9A52-2F8D8C1F0C11", ""} {
		if _, ok := parseMediaID(bad); ok {
			t.Errorf("parseMediaID(%q) deveria recusar", bad)
		}
	}
	if _, ok := mediaIDFromURL(strPtr("https://outro.site/x.png")); ok {
		t.Fatal("URL de fora não é arquivo nosso")
	}
}

func TestValidateProfileNameStyle(t *testing.T) {
	in := validInput()
	in.NameStyle = &namestyle.Style{Font: "medieval", Effect: "gradient", Colors: []string{"#FF0000", "#0000FF"}}
	out, err := ValidateProfile(in)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if out.NameStyle == nil || out.NameStyle.Colors[0] != "#ff0000" {
		t.Fatalf("estilo = %+v", out.NameStyle)
	}

	in.NameStyle = &namestyle.Style{Font: "comic", Effect: "solid"}
	if _, err := ValidateProfile(in); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("err = %v, want ErrInvalidProfile", err)
	}

	in.NameStyle = nil
	out, err = ValidateProfile(in)
	if err != nil || out.NameStyle != nil {
		t.Fatalf("sem estilo deve continuar nil: %+v, %v", out.NameStyle, err)
	}
}

func TestValidateProfileTheme(t *testing.T) {
	in := validInput()
	in.ProfileTheme = &profiletheme.Theme{
		Border: "neon", BorderColors: []string{"#00FFAA"},
		Background: "gradient", BackgroundColors: []string{"#1E1B4B", "#0F172A"},
		Effect: "snow",
	}
	out, err := ValidateProfile(in)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if out.ProfileTheme == nil || out.ProfileTheme.BorderColors[0] != "#00ffaa" || out.ProfileTheme.BackgroundColors[1] != "#0f172a" {
		t.Fatalf("tema = %+v", out.ProfileTheme)
	}

	in.ProfileTheme = &profiletheme.Theme{Border: "rainbow", Background: "solid", BackgroundColors: []string{"url(x)"}, Effect: "none"}
	if _, err := ValidateProfile(in); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("err = %v, want ErrInvalidProfile", err)
	}

	in.ProfileTheme = nil
	out, err = ValidateProfile(in)
	if err != nil || out.ProfileTheme != nil {
		t.Fatalf("sem tema deve continuar nil: %+v, %v", out.ProfileTheme, err)
	}
}

// Validadores por campo: os mesmos do perfil global valem para o do servidor.
func TestFieldValidators(t *testing.T) {
	if err := ValidateTextFields(strings.Repeat("a", MaxPronouns+1), "", ""); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("pronomes longos: %v", err)
	}
	if err := ValidateTextFields("", strings.Repeat("a", MaxBio+1), ""); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("bio longa: %v", err)
	}
	if err := ValidateTextFields("", "", strings.Repeat("a", MaxStatusText+1)); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("nota longa: %v", err)
	}
	if color, err := NormalizeBannerColor("#AABBCC"); err != nil || color != "#aabbcc" {
		t.Fatalf("cor: %q %v", color, err)
	}
	if _, err := NormalizeBannerColor("azul"); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("cor inválida: %v", err)
	}
	if links, err := NormalizeLinks(nil); err != nil || links == nil || len(links) != 0 {
		t.Fatalf("sem links nunca é nil: %v %v", links, err)
	}
}
