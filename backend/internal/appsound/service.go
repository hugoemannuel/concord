package appsound

import (
	"context"
	"errors"
)

var ErrUnknownEvent = errors.New("unknown sound event")

// store é o que o serviço usa do Repository.
type store interface {
	Settings(ctx context.Context, userID string) (Settings, error)
	SaveSettings(ctx context.Context, userID string, s Settings) error
	Files(ctx context.Context, userID string) (map[string]string, error)
	SetFile(ctx context.Context, userID, event, fileID string, durationMs int) (string, error)
	RemoveFile(ctx context.Context, userID, event string) (string, error)
}

type Service struct {
	repo store
}

func NewService(repo store) *Service {
	return &Service{repo: repo}
}

// Get: as escolhas e as URLs dos áudios próprios.
func (s *Service) Get(ctx context.Context, userID string) (View, error) {
	settings, err := s.repo.Settings(ctx, userID)
	if err != nil {
		return View{}, err
	}
	files, err := s.repo.Files(ctx, userID)
	if err != nil {
		return View{}, err
	}
	custom := make(map[string]string, len(files))
	for event, id := range files {
		custom[event] = fileURL(id)
	}
	return View{Settings: settings, Custom: custom}, nil
}

// Save troca as escolhas inteiras e devolve a visão nova.
func (s *Service) Save(ctx context.Context, userID string, in Settings) (View, error) {
	if in.Events == nil {
		in.Events = map[string]string{}
	}
	if err := in.Validate(); err != nil {
		return View{}, err
	}
	if err := s.repo.SaveSettings(ctx, userID, in); err != nil {
		return View{}, err
	}
	return s.Get(ctx, userID)
}

// SetFile grava o áudio próprio do evento; devolve o id do arquivo anterior.
func (s *Service) SetFile(ctx context.Context, userID, event, fileID string, durationMs int) (string, error) {
	if !ValidEvent(event) {
		return "", ErrUnknownEvent
	}
	return s.repo.SetFile(ctx, userID, event, fileID, durationMs)
}

// RemoveFile tira o áudio próprio do evento; devolve o id do arquivo.
func (s *Service) RemoveFile(ctx context.Context, userID, event string) (string, error) {
	if !ValidEvent(event) {
		return "", ErrUnknownEvent
	}
	return s.repo.RemoveFile(ctx, userID, event)
}
