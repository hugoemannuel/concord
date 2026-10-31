package user

import (
	"context"

	"gin-quickstart/backend/internal/cosmetics"
)

// Faixa e moldura (#482): as imagens e o modo da faixa. Cada mudança avisa os
// outros clientes (user:update), como avatar e banner.

// SetNameplate grava a imagem própria da faixa (nil apaga) e devolve a antiga.
func (s *ProfileService) SetNameplate(ctx context.Context, userID string, url *string) (*User, *string, error) {
	return s.swap(ctx, userID, url, s.repo.SetNameplate)
}

// SetDecoration grava a moldura do avatar (nil tira) e devolve a antiga.
func (s *ProfileService) SetDecoration(ctx context.Context, userID string, url *string) (*User, *string, error) {
	return s.swap(ctx, userID, url, s.repo.SetDecoration)
}

// SetNameplateMode troca o modo da faixa. "custom" exige uma imagem própria
// guardada; "banner" vale mesmo sem banner (a faixa só fica vazia).
func (s *ProfileService) SetNameplateMode(ctx context.Context, userID, mode string) (*User, error) {
	if !cosmetics.ValidMode(mode) {
		return nil, invalid("modo da faixa desconhecido")
	}
	if mode == cosmetics.ModeCustom {
		u, err := s.repo.FindByID(ctx, userID)
		if err != nil {
			return nil, notFound(err)
		}
		if u.NameplateCustomURL == nil {
			return nil, invalid("envie uma imagem para a faixa")
		}
	}
	u, err := s.repo.SetNameplateMode(ctx, userID, mode)
	if err != nil {
		return nil, notFound(err)
	}
	s.publish(u)
	return u, nil
}
