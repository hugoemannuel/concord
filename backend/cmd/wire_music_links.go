package main

import (
	"context"

	"gin-quickstart/backend/internal/music"
	"gin-quickstart/backend/internal/musiclinks"

	"github.com/gin-gonic/gin"
)

// wireMusicLinks: links diretos do menu "Ouvir também" da atividade de música
// (docs/adr/0033-links-diretos-do-ouvir-tambem.md). A busca no YouTube é a do
// Maestro, com o mesmo cache do "Adicionar à fila".
func (a *app) wireMusicLinks() {
	links := musiclinks.NewService(musiclinks.ConfigFromEnv(), musicVideos{a.musicManager})
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		musiclinks.Routes(api, musiclinks.NewHandler(links), a.authMiddleware)
	})
}

// musicVideos adapta a busca do Maestro ao que o musiclinks precisa.
type musicVideos struct{ m *music.Manager }

func (v musicVideos) FindVideos(ctx context.Context, query string) ([]musiclinks.Video, error) {
	tracks, err := v.m.FindTracks(ctx, query)
	videos := make([]musiclinks.Video, len(tracks))
	for i, t := range tracks {
		videos[i] = musiclinks.Video{ID: t.VideoID, Title: t.Title, Channel: t.Artist}
	}
	return videos, err
}
