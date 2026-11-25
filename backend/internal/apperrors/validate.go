package apperrors

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// ErrInvalidBatch: o pedido não dá para gravar (400).
var ErrInvalidBatch = errors.New("relatório de erros inválido")

// Limites de um pedido: o texto que passa é cortado; a contagem vai ao teto.
const (
	maxErrors  = 10
	maxKind    = 60
	maxScreen  = 80
	maxOS      = 60
	maxVersion = 32
	maxCount   = 10_000
)

var (
	clientSources = map[string]bool{SourceRenderer: true, SourceMain: true, SourceMobile: true}
	clientTargets = map[string]bool{TargetDesktop: true, TargetWeb: true, TargetAndroid: true}
	// a tela é o padrão da rota (/servers/:id, (tabs)/[id]), nunca texto livre.
	reRoute = regexp.MustCompile(`^[A-Za-z0-9/:._\-\[\]()*+~]*$`)
)

// Validate recusa o pedido com origem ou alvo errado e limpa e corta o resto
// (com a impressão digital do servidor em cada erro).
func (b *Batch) Validate() error {
	if len(b.Errors) == 0 || len(b.Errors) > maxErrors {
		return fmt.Errorf("%w: %d erros", ErrInvalidBatch, len(b.Errors))
	}
	if !clientTargets[b.Context.Target] {
		return fmt.Errorf("%w: alvo %q", ErrInvalidBatch, b.Context.Target)
	}
	b.Context.OS = cut(oneLine(b.Context.OS), maxOS)
	b.Context.AppVersion = cut(oneLine(b.Context.AppVersion), maxVersion)
	for i := range b.Errors {
		e := &b.Errors[i]
		if !clientSources[e.Source] {
			return fmt.Errorf("%w: origem %q", ErrInvalidBatch, e.Source)
		}
		e.Screen = cleanScreen(e.Screen)
		prepare(e)
	}
	return nil
}

// prepare limpa, corta e calcula a impressão digital (cliente e panic do backend).
func prepare(e *Captured) {
	e.Kind = cut(oneLine(scrubText(e.Kind)), maxKind)
	e.Message = scrubMessage(e.Message)
	e.Stack = scrubStack(e.Stack)
	e.Screen = cut(e.Screen, maxScreen)
	e.Count = clampCount(e.Count)
	e.Fingerprint = Fingerprint(e.Source, e.Kind, e.Message, e.Stack)
}

// cleanScreen: id vira :id, sem query e fragmento; fora do formato de rota, vazio.
func cleanScreen(s string) string {
	s = reUUID.ReplaceAllString(s, ":id")
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	s = cut(s, maxScreen)
	if !reRoute.MatchString(s) {
		return ""
	}
	return s
}

func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func clampCount(n int) int {
	return max(1, min(n, maxCount))
}
