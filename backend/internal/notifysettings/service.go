package notifysettings

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/wsevent"
)

type store interface {
	All(ctx context.Context, userID string) (All, error)
	AllFor(ctx context.Context, userIDs []string) (map[string]All, error)
	SetServer(ctx context.Context, userID, serverID string, s Settings) error
	DeleteServer(ctx context.Context, userID, serverID string) error
	SetChannel(ctx context.Context, userID, channelID string, s Settings) error
	DeleteChannel(ctx context.Context, userID, channelID string) error
}

type permissions interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
	RequireChannel(ctx context.Context, channelID, userID string, want int64) error
}

// EventPublisher entrega o evento às janelas abertas da própria pessoa.
type EventPublisher interface {
	SendToUser(userID string, event []byte)
}

type Service struct {
	store     store
	perms     permissions
	publisher EventPublisher
	now       func() time.Time
}

func NotifySettingsService(repository *Repository, perms *permission.Service, publisher EventPublisher) *Service {
	return newService(repository, perms, publisher)
}

func newService(st store, perms permissions, publisher EventPublisher) *Service {
	return &Service{store: st, perms: perms, publisher: publisher, now: time.Now}
}

func (s *Service) All(ctx context.Context, userID string) (All, error) {
	return s.store.All(ctx, userID)
}

// AllFor: as preferências de várias pessoas numa consulta (push de @all).
func (s *Service) AllFor(ctx context.Context, userIDs []string) (map[string]All, error) {
	return s.store.AllFor(ctx, userIDs)
}

// SetServer grava a preferência da pessoa para um servidor de que ela é membro.
func (s *Service) SetServer(ctx context.Context, userID, serverID string, in Settings) (Settings, error) {
	norm, err := in.normalize(s.now())
	if err != nil {
		return Settings{}, err
	}
	if err := s.perms.Require(ctx, serverID, userID, permission.ViewChannel); err != nil {
		return Settings{}, err
	}
	if norm.IsDefault() {
		err = s.store.DeleteServer(ctx, userID, serverID)
	} else {
		err = s.store.SetServer(ctx, userID, serverID, norm)
	}
	if err != nil {
		return Settings{}, err
	}
	s.publish(userID, "server", serverID, norm)
	return norm, nil
}

// SetChannel grava a preferência para um canal que a pessoa pode ver. O
// suppress_everyone só vale por servidor.
func (s *Service) SetChannel(ctx context.Context, userID, channelID string, in Settings) (Settings, error) {
	in.SuppressEveryone = false
	norm, err := in.normalize(s.now())
	if err != nil {
		return Settings{}, err
	}
	if err := s.perms.RequireChannel(ctx, channelID, userID, permission.ViewChannel); err != nil {
		return Settings{}, err
	}
	if norm.IsDefault() {
		err = s.store.DeleteChannel(ctx, userID, channelID)
	} else {
		err = s.store.SetChannel(ctx, userID, channelID, norm)
	}
	if err != nil {
		return Settings{}, err
	}
	s.publish(userID, "channel", channelID, norm)
	return norm, nil
}

func (s *Service) publish(userID, scope, id string, settings Settings) {
	if s.publisher == nil {
		return
	}
	data, err := wsevent.Encode("notification-settings:update", map[string]any{"scope": scope, "id": id, "settings": settings})
	if err != nil {
		log.Printf("[notifysettings] publish: %v", err)
		return
	}
	s.publisher.SendToUser(userID, data)
}
