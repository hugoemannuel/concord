package apptheme

import (
	"errors"
	"slices"
	"testing"

	"gin-quickstart/backend/internal/profiletheme"
)

const imageURL = "/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e"

func TestNormalizeBackdrop(t *testing.T) {
	t.Run("tema sem os campos da v3 ganha os padrões (sem efeito, sem imagem)", func(t *testing.T) {
		got, err := Normalize([]Theme{valid()})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if g.Effect != "none" || *g.EffectDensity != 50 || *g.EffectSpeed != 50 || g.EffectColor != "" {
			t.Fatalf("efeito: %+v", g)
		}
		if g.Image != "" || *g.ImageDim != DefaultImageDim || *g.ImageBlur != 0 {
			t.Fatalf("imagem: %+v", g)
		}
	})

	t.Run("efeito, imagem e fonte nova válidos ficam", func(t *testing.T) {
		th := valid()
		th.Effect, th.EffectDensity, th.EffectSpeed, th.EffectColor = "snow", intp(100), intp(1), "#FFFFFF"
		th.Image, th.ImageDim, th.ImageBlur = imageURL, intp(90), intp(20)
		th.Font = "montserrat"
		got, err := Normalize([]Theme{th})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if g.Effect != "snow" || g.EffectColor != "#ffffff" || *g.EffectDensity != 100 || g.Image != imageURL || *g.ImageBlur != 20 {
			t.Fatalf("got %+v", g)
		}
	})

	with := func(f func(*Theme)) []Theme {
		th := valid()
		f(&th)
		return []Theme{th}
	}
	bad := map[string][]Theme{
		"efeito desconhecido":       with(func(th *Theme) { th.Effect = "fumaça" }),
		"quantidade zero":           with(func(th *Theme) { th.EffectDensity = intp(0) }),
		"velocidade acima de 100":   with(func(th *Theme) { th.EffectSpeed = intp(101) }),
		"cor do efeito inválida":    with(func(th *Theme) { th.EffectColor = "azul" }),
		"imagem de fora":            with(func(th *Theme) { th.Image = "https://exemplo.com/a.png" }),
		"imagem com url maliciosa":  with(func(th *Theme) { th.Image = imageURL + "');background:url(x" }),
		"imagem de outra pasta":     with(func(th *Theme) { th.Image = "/api/profile-media/0f8fad5b-d9cb-469f-a165-70867728950e" }),
		"escurecer acima do máximo": with(func(th *Theme) { th.ImageDim = intp(MaxImageDim + 1) }),
		"desfoque acima do máximo":  with(func(th *Theme) { th.ImageBlur = intp(MaxImageBlur + 1) }),
	}
	for name, in := range bad {
		t.Run(name, func(t *testing.T) {
			if _, err := Normalize(in); !errors.Is(err, ErrInvalidThemes) {
				t.Fatalf("err = %v, queria ErrInvalidThemes", err)
			}
		})
	}
}

func TestImageURLs(t *testing.T) {
	a := valid()
	a.Image = imageURL
	b := valid()
	got := imageIDs([]Theme{a, b})
	if len(got) != 1 || !got["0f8fad5b-d9cb-469f-a165-70867728950e"] {
		t.Fatalf("got %v", got)
	}
}

func TestNormalizeEffectLook(t *testing.T) {
	t.Run("tema salvo sem os campos novos fica igual", func(t *testing.T) {
		got, err := Normalize([]Theme{valid()})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if *g.EffectSize != 50 || g.EffectDirection != "default" || *g.EffectOpacity != 100 || g.EffectPalette != "single" || g.EffectColor2 != "" || g.EffectArea != "full" || *g.EffectGlow != 0 {
			t.Fatalf("padrões: %+v", g)
		}
	})

	t.Run("valores válidos e efeito novo ficam", func(t *testing.T) {
		th := valid()
		th.Effect, th.EffectSize, th.EffectDirection, th.EffectOpacity = "fireworks", intp(100), "left", intp(10)
		th.EffectPalette, th.EffectColor2, th.EffectArea, th.EffectGlow = "duo", "#ABCDEF", "banner", intp(100)
		got, err := Normalize([]Theme{th})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if g.Effect != "fireworks" || g.EffectColor2 != "#abcdef" || g.EffectArea != "banner" || *g.EffectGlow != 100 {
			t.Fatalf("got %+v", g)
		}
	})

	bad := map[string]func(*Theme){
		"tamanho zero":         func(th *Theme) { th.EffectSize = intp(0) },
		"tamanho acima":        func(th *Theme) { th.EffectSize = intp(101) },
		"opacidade zero":       func(th *Theme) { th.EffectOpacity = intp(0) },
		"brilho acima":         func(th *Theme) { th.EffectGlow = intp(101) },
		"brilho negativo":      func(th *Theme) { th.EffectGlow = intp(-1) },
		"direção desconhecida": func(th *Theme) { th.EffectDirection = "diagonal" },
		"mistura desconhecida": func(th *Theme) { th.EffectPalette = "neon" },
		"área desconhecida":    func(th *Theme) { th.EffectArea = "avatar" },
		"segunda cor inválida": func(th *Theme) { th.EffectColor2 = "azul" },
	}
	for name, f := range bad {
		t.Run(name, func(t *testing.T) {
			th := valid()
			f(&th)
			if _, err := Normalize([]Theme{th}); !errors.Is(err, ErrInvalidThemes) {
				t.Fatalf("err = %v, queria ErrInvalidThemes", err)
			}
		})
	}
}

// O fundo do app aceita exatamente os efeitos do cartão de perfil.
func TestEffectsSameAsProfile(t *testing.T) {
	if !slices.Equal(effects, profiletheme.Effects) {
		t.Fatalf("efeitos diferentes: %v", effects)
	}
}
