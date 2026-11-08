// Package linkpreview monta o cartão de prévia (estilo Discord) dos links das
// mensagens: busca a página com um cliente blindado contra SSRF, lê as tags
// og:*, guarda por URL (24 h) e serve a imagem pelo próprio servidor.
// Spec: docs/superpowers/specs/2026-11-07-chat-previa-links-design.md.
package linkpreview

import "time"

// Preview é o cartão que o app desenha.
type Preview struct {
	URL         string `json:"url"`
	SiteName    string `json:"site_name,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	// ImageID: a imagem baixada, em GET /link-previews/image/:id.
	ImageID string `json:"image_id,omitempty"`
	// Color: theme-color do site (#rgb/#rrggbb), para a faixa do cartão.
	Color string `json:"color,omitempty"`
	// YouTubeID: o vídeo toca dentro do chat (player do youtube-nocookie).
	YouTubeID string `json:"youtube_id,omitempty"`
}

// Entry é uma linha do cache (link_previews). Failed guarda também a falha,
// para não martelar site fora do ar nem página sem tags.
type Entry struct {
	Preview
	Failed    bool
	FetchedAt time.Time
}

// card: o cartão da linha, ou nil quando a busca falhou.
func (e Entry) card() *Preview {
	if e.Failed {
		return nil
	}
	p := e.Preview
	return &p
}
