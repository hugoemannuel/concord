// Package changelog guarda, por versão do app, o que cada release trouxe.
// As releases chegam pelo deploy (PUT com token de CI) e todo usuário logado lê.
package changelog

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	KindFeature = "feature"
	KindFix     = "fix"

	maxEntries   = 1000 // o deploy reenvia todos os arquivos de pending/ (ver dedup.go)
	maxEntryText = 1000 // em caracteres (runas), não bytes: acento conta 1
	maxSummary   = 500
	maxSource    = 200
)

var versionRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// Source identifica de onde a nota veio (o arquivo em changelog/pending/): é
// ela, e não o texto, que diz se a nota já saiu numa release.
// Highlight: a nota aparece no modal de novidades (cabeçalho destaque: true).
// Required só chega no PUT (cabeçalho obrigatoria: true): não é guardado na
// nota, vira o Required da release (ver publish).
type Entry struct {
	Kind      string `json:"kind"`
	Text      string `json:"text"`
	Source    string `json:"source,omitempty"`
	Highlight bool   `json:"highlight,omitempty"`
	Required  bool   `json:"required,omitempty"`
}

// Required: quem tem uma versão anterior precisa atualizar (ADR 0066).
type Release struct {
	Version    string    `json:"version"`
	ReleasedAt time.Time `json:"released_at"`
	Summary    string    `json:"summary"`
	Required   bool      `json:"required"`
	Entries    []Entry   `json:"entries"`
}

// Publication é o corpo do PUT. Sem released_at, uma release nova usa a hora
// atual e uma existente mantém a data que já tinha.
type Publication struct {
	ReleasedAt *time.Time `json:"released_at"`
	Summary    string     `json:"summary"`
	Entries    []Entry    `json:"entries"`
	// Calculado no publish, pelas notas novas; não vem no corpo.
	Required bool `json:"-"`
}

type store interface {
	List(ctx context.Context) ([]Release, error)
	Upsert(ctx context.Context, version string, p Publication) error
}

func (p *Publication) validate() error {
	p.Summary = strings.TrimSpace(p.Summary)
	if utf8.RuneCountInString(p.Summary) > maxSummary {
		return errors.New("summary muito longo")
	}
	if len(p.Entries) > maxEntries {
		return errors.New("entradas demais")
	}
	for i := range p.Entries {
		e := &p.Entries[i]
		e.Text = strings.TrimSpace(e.Text)
		e.Source = strings.TrimSpace(e.Source)
		if e.Kind != KindFeature && e.Kind != KindFix {
			return errors.New("kind inválido")
		}
		if e.Text == "" || utf8.RuneCountInString(e.Text) > maxEntryText {
			return errors.New("texto inválido")
		}
		if utf8.RuneCountInString(e.Source) > maxSource {
			return errors.New("origem inválida")
		}
	}
	return nil
}
