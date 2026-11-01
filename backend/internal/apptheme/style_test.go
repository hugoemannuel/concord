package apptheme

import (
	"encoding/json"
	"errors"
	"testing"
)

func intp(n int) *int { return &n }

func TestNormalizeV2(t *testing.T) {
	t.Run("tema da v1 ganha os padrões que reproduzem a v1", func(t *testing.T) {
		th := valid()
		th.Glow = "#5b21b6"
		got, err := Normalize([]Theme{th})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if *g.GlowStrength != 100 || *g.Glass != V1Glass || *g.Radius != 100 || g.Density != "normal" || g.Font != "outfit" {
			t.Fatalf("padrões errados: %+v", g)
		}
		if g.Gradients == nil || len(g.Gradients) != 0 {
			t.Fatalf("gradients = %v", g.Gradients)
		}
		noGlow, _ := Normalize([]Theme{valid()})
		if *noGlow[0].Glass != 0 {
			t.Fatalf("sem brilho, sem vidro: %d", *noGlow[0].Glass)
		}
	})

	t.Run("campos v2 válidos ficam (cores em minúsculas)", func(t *testing.T) {
		th := valid()
		th.Gradients = map[string]Gradient{"background": {Type: "radial", Angle: 90, Colors: []string{"#FF0000", "#000000"}}}
		th.Highlight, th.TextMuted, th.Border = "#F472B6", "", "#AAAAAA"
		th.GlowStrength, th.Glass, th.Radius = intp(30), intp(60), intp(200)
		th.Density, th.Font = "compact", "mono"
		got, err := Normalize([]Theme{th})
		if err != nil {
			t.Fatal(err)
		}
		g := got[0]
		if g.Gradients["background"].Colors[0] != "#ff0000" || g.Highlight != "#f472b6" || g.Border != "#aaaaaa" {
			t.Fatalf("got %+v", g)
		}
		if *g.Glass != 60 || *g.Radius != 200 || g.Density != "compact" || g.Font != "mono" {
			t.Fatalf("got %+v", g)
		}
	})

	with := func(f func(*Theme)) []Theme {
		th := valid()
		f(&th)
		return []Theme{th}
	}
	grad := func(g Gradient) map[string]Gradient { return map[string]Gradient{"accent": g} }
	bad := map[string][]Theme{
		"degradê sem cor": with(func(th *Theme) { th.Gradients = grad(Gradient{Type: "linear", Colors: nil}) }),
		"degradê com 3 cores": with(func(th *Theme) {
			th.Gradients = grad(Gradient{Type: "linear", Colors: []string{"#000000", "#000000", "#000000"}})
		}),
		"degradê de outro tipo": with(func(th *Theme) { th.Gradients = grad(Gradient{Type: "conic", Colors: []string{"#000000"}}) }),
		"ângulo fora": with(func(th *Theme) {
			th.Gradients = grad(Gradient{Type: "linear", Angle: 361, Colors: []string{"#000000"}})
		}),
		"degradê em campo errado": with(func(th *Theme) {
			th.Gradients = map[string]Gradient{"text": {Type: "linear", Colors: []string{"#000000"}}}
		}),
		"cor de degradê inválida": with(func(th *Theme) { th.Gradients = grad(Gradient{Type: "linear", Colors: []string{"red"}}) }),
		"realce inválido":         with(func(th *Theme) { th.Highlight = "rosa" }),
		"vidro acima de 100":      with(func(th *Theme) { th.Glass = intp(101) }),
		"brilho negativo":         with(func(th *Theme) { th.GlowStrength = intp(-1) }),
		"cantos acima do máximo":  with(func(th *Theme) { th.Radius = intp(RadiusMax + 1) }),
		"densidade desconhecida":  with(func(th *Theme) { th.Density = "gigante" }),
		"fonte desconhecida":      with(func(th *Theme) { th.Font = "comic" }),
	}
	for name, in := range bad {
		t.Run(name, func(t *testing.T) {
			if _, err := Normalize(in); !errors.Is(err, ErrInvalidThemes) {
				t.Fatalf("err = %v, queria ErrInvalidThemes", err)
			}
		})
	}
}

func TestMigrate(t *testing.T) {
	// Linha gravada pela v1 (sem os campos novos) lida do banco.
	var stored []Theme
	raw := `[{"id":"abc","name":"Antigo","accent":"#e11d48","background":"#1a1a1e","sidebar":"#121214","card":"#242429","text":"#efeff1","glow":"#5b21b6"}]`
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		t.Fatal(err)
	}
	got := Migrate(stored)
	if *got[0].Glass != V1Glass || *got[0].GlowStrength != 100 || got[0].Font != "outfit" || got[0].Gradients == nil {
		t.Fatalf("got %+v", got[0])
	}
	out, _ := json.Marshal(got[0])
	if !json.Valid(out) || string(out) == raw {
		t.Fatalf("json = %s", out)
	}
}
