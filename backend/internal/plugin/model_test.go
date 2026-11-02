package plugin

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateDraftURL(t *testing.T) {
	casos := []struct {
		nome  string
		url   string
		saida string
		erro  error
	}{
		{"https valida", "https://placar.exemplo.com/painel", "https://placar.exemplo.com/painel", nil},
		{"esquema maiusculo", "HTTPS://x.com", "https://x.com", nil},
		{"http", "http://x.com", "", ErrInvalidURL},
		{"javascript", "javascript:alert(1)", "", ErrInvalidURL},
		{"host vazio", "https:///x", "", ErrInvalidURL},
		{"vazia", "", "", ErrInvalidURL},
		{"ftp", "ftp://x.com", "", ErrInvalidURL},
		{"longa demais", "https://" + strings.Repeat("a", 2048), "", ErrInvalidURL},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			got, err := ValidateDraft(Draft{Name: "P", Description: "d", PanelURL: c.url})
			if !errors.Is(err, c.erro) {
				t.Fatalf("erro = %v, esperado %v", err, c.erro)
			}
			if c.erro == nil && got.PanelURL != c.saida {
				t.Fatalf("url = %q, esperado %q", got.PanelURL, c.saida)
			}
		})
	}
}

func TestValidateDraftNameAndDescription(t *testing.T) {
	casos := []struct {
		nome      string
		d         Draft
		erro      error
		nomeSaida string
	}{
		{"nome com espacos", Draft{"  Placar  ", "d", "https://x.com"}, nil, "Placar"},
		{"nome vazio", Draft{"  ", "d", "https://x.com"}, ErrInvalidName, ""},
		{"nome 41 runas", Draft{strings.Repeat("é", 41), "d", "https://x.com"}, ErrInvalidName, ""},
		{"nome 40 runas", Draft{strings.Repeat("é", 40), "d", "https://x.com"}, nil, strings.Repeat("é", 40)},
		{"descricao 121 runas", Draft{"P", strings.Repeat("é", 121), "https://x.com"}, ErrInvalidDescription, ""},
		{"descricao 120 runas", Draft{"P", strings.Repeat("é", 120), "https://x.com"}, nil, "P"},
		{"descricao vazia", Draft{"P", " ", "https://x.com"}, ErrInvalidDescription, ""},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			got, err := ValidateDraft(c.d)
			if !errors.Is(err, c.erro) {
				t.Fatalf("erro = %v, esperado %v", err, c.erro)
			}
			if c.erro == nil && got.Name != c.nomeSaida {
				t.Fatalf("nome = %q, esperado %q", got.Name, c.nomeSaida)
			}
		})
	}
}

func TestCanTransition(t *testing.T) {
	casos := []struct {
		de, para Status
		ok       bool
	}{
		{StatusPending, StatusApproved, true},
		{StatusPending, StatusRejected, true},
		{StatusApproved, StatusRejected, true},
		{StatusRejected, StatusApproved, true},
		{StatusApproved, StatusApproved, false},
		{StatusRejected, StatusPending, false},
		{StatusApproved, StatusPending, false},
		{StatusPending, StatusPending, false},
	}
	for _, c := range casos {
		if got := CanTransition(c.de, c.para); got != c.ok {
			t.Errorf("%s->%s = %v, esperado %v", c.de, c.para, got, c.ok)
		}
	}
}
