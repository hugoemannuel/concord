package apptheme

import (
	"errors"
	"strings"
	"testing"
)

func valid() Theme {
	return Theme{ID: "abc123", Name: "Vermelho e branco", Accent: "#e11d48", Background: "#ffffff", Sidebar: "#fff1f2", Card: "#ffffff", Text: "#1f1f1f", Glow: ""}
}

func TestNormalize(t *testing.T) {
	with := func(f func(*Theme)) []Theme {
		th := valid()
		f(&th)
		return []Theme{th}
	}
	tooMany := make([]Theme, MaxThemes+1)
	for i := range tooMany {
		tooMany[i] = valid()
		tooMany[i].ID = strings.Repeat("a", i+1)
	}
	bad := map[string][]Theme{
		"cor inválida":      with(func(th *Theme) { th.Accent = "red" }),
		"cor curta":         with(func(th *Theme) { th.Text = "#fff" }),
		"brilho inválido":   with(func(th *Theme) { th.Glow = "azul" }),
		"id com espaço":     with(func(th *Theme) { th.ID = "a b" }),
		"id vazio":          with(func(th *Theme) { th.ID = "" }),
		"id longo":          with(func(th *Theme) { th.ID = strings.Repeat("a", 25) }),
		"nome vazio":        with(func(th *Theme) { th.Name = "   " }),
		"nome longo":        with(func(th *Theme) { th.Name = strings.Repeat("á", NameMax+1) }),
		"nome com controle": with(func(th *Theme) { th.Name = "a\x00b" }),
		"id repetido":       {valid(), valid()},
		"temas demais":      tooMany,
	}
	for name, in := range bad {
		t.Run(name, func(t *testing.T) {
			if _, err := Normalize(in); !errors.Is(err, ErrInvalidThemes) {
				t.Fatalf("err = %v, queria ErrInvalidThemes", err)
			}
		})
	}

	t.Run("apara o nome e põe as cores em minúsculas", func(t *testing.T) {
		th := valid()
		th.Name = "  Meu tema  "
		th.Accent = "#E11D48"
		th.Glow = "#DC2626"
		got, err := Normalize([]Theme{th})
		if err != nil {
			t.Fatal(err)
		}
		if got[0].Name != "Meu tema" || got[0].Accent != "#e11d48" || got[0].Glow != "#dc2626" {
			t.Fatalf("got %+v", got[0])
		}
	})

	t.Run("lista vazia ou nula vira vazia", func(t *testing.T) {
		got, err := Normalize(nil)
		if err != nil || got == nil || len(got) != 0 {
			t.Fatalf("got %v, %v", got, err)
		}
	})
}
