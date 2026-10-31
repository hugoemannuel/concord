// Package musiclinks acha a faixa que alguém está ouvindo nos serviços de
// música e devolve o link direto de cada um (menu "Ouvir também" da atividade,
// docs/adr/0033-links-diretos-do-ouvir-tambem.md). Serviço que não achou ou
// falhou fica de fora: o cliente usa o link de busca de sempre.
package musiclinks

import (
	"context"
	"strings"
)

// Chaves do JSON, uma por serviço (o cliente mapeia para o nome na tela).
const (
	YouTube      = "youtube"
	YouTubeMusic = "youtube_music"
	Spotify      = "spotify"
	Deezer       = "deezer"
	AppleMusic   = "apple_music"
)

// queryMax: igual ao limite da busca do Maestro (music.queryMax).
const queryMax = 200

// Links: serviço → URL da faixa (https, host do próprio serviço).
type Links map[string]string

// Query é a faixa como a atividade de música mostra (sem ID nem URL).
type Query struct {
	Artist string
	Title  string
}

// searchText: "artista - título", o mesmo texto que o cliente manda ao pôr na
// fila do Maestro; assim a busca no YouTube daqui já deixa o enqueue pronto.
func (q Query) searchText() string {
	title := strings.TrimSpace(q.Title)
	if artist := strings.TrimSpace(q.Artist); artist != "" {
		return artist + " - " + title
	}
	return title
}

// Video é um resultado da busca no YouTube (o Maestro faz a busca, com cache).
type Video struct {
	ID      string
	Title   string
	Channel string
}

// VideoSearcher: quem busca vídeos no YouTube (music.Manager, ligado em cmd/).
type VideoSearcher interface {
	FindVideos(ctx context.Context, query string) ([]Video, error)
}
