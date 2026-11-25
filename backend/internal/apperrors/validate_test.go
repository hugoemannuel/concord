package apperrors

import (
	"errors"
	"strings"
	"testing"
)

func validBatch() Batch {
	return Batch{
		Context: ClientContext{OS: "Windows", AppVersion: "1.4.2", Target: TargetDesktop},
		Errors: []Captured{{
			Source: SourceRenderer, Kind: "TypeError", Message: "Cannot read properties of undefined (reading 'id')",
			Stack: "TypeError: x\n    at Xy (https://app/assets/index-abc123.js:1:2)", Screen: "/servers/:id", Count: 3,
		}},
	}
}

func TestValidateRecusa(t *testing.T) {
	tests := []struct {
		name   string
		change func(b *Batch)
	}{
		{"sem erros", func(b *Batch) { b.Errors = nil }},
		{"erros demais", func(b *Batch) { b.Errors = make([]Captured, maxErrors+1) }},
		{"origem backend vinda do cliente", func(b *Batch) { b.Errors[0].Source = SourceBackend }},
		{"origem desconhecida", func(b *Batch) { b.Errors[0].Source = "plugin" }},
		{"alvo servidor vindo do cliente", func(b *Batch) { b.Context.Target = TargetServer }},
		{"alvo vazio", func(b *Batch) { b.Context.Target = "" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := validBatch()
			tt.change(&b)
			if err := b.Validate(); !errors.Is(err, ErrInvalidBatch) {
				t.Errorf("Validate() = %v, quer ErrInvalidBatch", err)
			}
		})
	}
}

func TestValidateLimpaCortaEDaAImpressaoDigital(t *testing.T) {
	b := validBatch()
	b.Context.OS = strings.Repeat("o", 100)
	b.Context.AppVersion = strings.Repeat("9", 50)
	e := &b.Errors[0]
	e.Kind = strings.Repeat("K", 100)
	e.Message = "falhou para ana@exemplo.com\nsegunda linha"
	e.Fingerprint = "do-cliente"
	if err := b.Validate(); err != nil {
		t.Fatalf("Validate() = %v", err)
	}
	if len(b.Context.OS) != maxOS || len(b.Context.AppVersion) != maxVersion || len(e.Kind) != maxKind {
		t.Errorf("cortes: os=%d versão=%d kind=%d", len(b.Context.OS), len(b.Context.AppVersion), len(e.Kind))
	}
	if e.Message != "falhou para <email> segunda linha" {
		t.Errorf("mensagem = %q", e.Message)
	}
	if e.Stack != "TypeError: x\n    at Xy (assets/index-abc123.js:1:2)" {
		t.Errorf("pilha = %q", e.Stack)
	}
	if e.Fingerprint != Fingerprint(e.Source, e.Kind, e.Message, e.Stack) {
		t.Errorf("impressão digital = %q, quer a do servidor", e.Fingerprint)
	}
}

func TestCleanScreen(t *testing.T) {
	tests := map[string]string{
		"/servers/:id/channels/:id":                     "/servers/:id/channels/:id",
		"/servers/123e4567-e89b-12d3-a456-426614174000": "/servers/:id",
		"/convite?token=abc#x":                          "/convite",
		"(tabs)/servers/[id]":                           "(tabs)/servers/[id]",
		"/busca/<script>":                               "",
		"/nome com espaço":                              "",
		"/" + strings.Repeat("a", 100):                  "/" + strings.Repeat("a", maxScreen-1),
	}
	for in, want := range tests {
		if got := cleanScreen(in); got != want {
			t.Errorf("cleanScreen(%q) = %q, quer %q", in, got, want)
		}
	}
}

func TestClampCount(t *testing.T) {
	for in, want := range map[int]int{-5: 1, 0: 1, 1: 1, 42: 42, maxCount: maxCount, maxCount + 1: maxCount} {
		if got := clampCount(in); got != want {
			t.Errorf("clampCount(%d) = %d, quer %d", in, got, want)
		}
	}
}
