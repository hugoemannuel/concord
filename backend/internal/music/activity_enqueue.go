package music

// Pôr na fila a partir de um texto ("artista - título") sem digitar /play:
// a atividade de música de outra pessoa (docs/ATIVIDADE.md). Mesmas travas do
// /play: Maestro no servidor, quem pede na call, uma música por vez por pessoa,
// vídeo ao vivo ou longo demais recusado. Não há seletor: entra o primeiro
// resultado que dá para tocar, direto da busca (com cache, search_cache.go).

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

// queryMax: tamanho máximo do texto da busca (título + artista cabem folgados).
const queryMax = 200

// searchCandidates: quantos resultados olhar para achar um que dá para tocar.
const searchCandidates = 5

var (
	ErrInvalidQuery = errors.New("busca inválida")
	ErrBusy         = errors.New("já tem um pedido seu em andamento")
)

// ReplyError é uma recusa com o texto do Maestro, o mesmo que o /play mandaria no chat.
type ReplyError struct{ Text string }

func (e ReplyError) Error() string { return e.Text }

// begin marca o usuário como ocupado; false = já há um pedido dele em andamento.
func (m *Manager) begin(userID string) (end func(), ok bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, working := m.busy[userID]; working {
		return nil, false
	}
	m.busy[userID] = struct{}{}
	return func() {
		m.mu.Lock()
		delete(m.busy, userID)
		m.mu.Unlock()
	}, true
}

// EnqueueQuery busca o texto e põe o primeiro resultado tocável na fila da
// call em que o usuário está. O aviso público sai como no /play.
func (m *Manager) EnqueueQuery(ctx context.Context, userID, serverID, query string) error {
	query = strings.TrimSpace(query)
	if query == "" || utf8.RuneCountInString(query) > queryMax {
		return ErrInvalidQuery
	}
	end, ok := m.begin(userID)
	if !ok {
		return ErrBusy
	}
	defer end()
	var reply string
	m.enqueueQuery(ctx, userID, serverID, query, func(text string) { reply = text })
	if reply != "" {
		return ReplyError{Text: reply}
	}
	return nil
}

func (m *Manager) enqueueQuery(ctx context.Context, userID, serverID, query string, say func(string)) {
	switch {
	case !m.available:
		say(TextUnavailable)
		return
	case !m.deps.BotEnabled(ctx, serverID):
		say(TextBotRemoved)
		return
	}
	loc, ok := m.deps.Locate(userID)
	if !ok || loc.ServerID != serverID {
		say(TextNotInVoice)
		return
	}
	results, err := m.FindTracks(ctx, query)
	if err != nil || len(results) == 0 {
		say(TextSearchEmpty(query))
		return
	}
	// O canal de voz serve de "canal de texto": o aviso público vai para o #musica.
	// O resultado da busca já basta: resolver o link de novo custava ~4 s (#445).
	m.enqueueTrack(ctx, loc, loc.ChannelID, userID, firstPlayable(results), say)
}

// firstPlayable: o primeiro resultado que não é ao vivo nem longo demais; sem
// nenhum, o primeiro mesmo (o enqueueTrack explica a recusa).
func firstPlayable(results []Track) Track {
	for _, t := range results {
		if !t.IsLive && t.DurationMs <= maxVideoMs {
			return t
		}
	}
	return results[0]
}
