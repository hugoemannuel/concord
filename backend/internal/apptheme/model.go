// Package apptheme guarda, por pessoa, os temas próprios da aparência do app
// (Configurações → Aparência): nome e as poucas cores que a pessoa escolhe. A
// paleta inteira é gerada no app; qual tema está em uso é escolha de cada
// aparelho. Ver docs/adr/0040-aparencia-personalizada.md.
package apptheme

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	MaxThemes = 10
	NameMax   = 32
)

var ErrInvalidThemes = errors.New("invalid app themes")

var (
	idPattern  = regexp.MustCompile(`^[a-z0-9]{1,24}$`)
	hexPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)
)

// Theme é um tema próprio. Cores em #rrggbb; Glow "" = sem brilho.
type Theme struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Accent     string `json:"accent"`
	Background string `json:"background"`
	Sidebar    string `json:"sidebar"`
	Card       string `json:"card"`
	Text       string `json:"text"`
	Glow       string `json:"glow"`
}

func validName(name string) bool {
	n := utf8.RuneCountInString(name)
	return n >= 1 && n <= NameMax && !strings.ContainsFunc(name, unicode.IsControl)
}

func normalizeTheme(t Theme) (Theme, bool) {
	t.Name = strings.TrimSpace(t.Name)
	colors := []*string{&t.Accent, &t.Background, &t.Sidebar, &t.Card, &t.Text}
	ok := idPattern.MatchString(t.ID) && validName(t.Name)
	for _, c := range colors {
		*c = strings.ToLower(*c)
		ok = ok && hexPattern.MatchString(*c)
	}
	t.Glow = strings.ToLower(t.Glow)
	return t, ok && (t.Glow == "" || hexPattern.MatchString(t.Glow))
}

// Normalize confere a lista inteira (até MaxThemes, ids únicos) e devolve
// nomes aparados e cores em minúsculas.
func Normalize(in []Theme) ([]Theme, error) {
	if len(in) > MaxThemes {
		return nil, ErrInvalidThemes
	}
	out := make([]Theme, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, raw := range in {
		t, ok := normalizeTheme(raw)
		if !ok || seen[t.ID] {
			return nil, ErrInvalidThemes
		}
		seen[t.ID] = true
		out = append(out, t)
	}
	return out, nil
}
