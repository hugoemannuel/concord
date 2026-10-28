package server

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
)

// SetPrimaryChannel troca o canal principal e avisa o servidor.
func (s *Service) SetPrimaryChannel(ctx context.Context, serverID string, channelID string, actorID string) (*Server, error) {
	mark := &audit.Mark{ServerID: serverID, ActorID: actorID, Action: audit.ServerPrimaryChannel}
	if err := s.repository.SetPrimaryChannel(ctx, serverID, channelID, mark); err != nil {
		return nil, err
	}

	updated, err := s.repository.FindByID(ctx, serverID)
	if err != nil {
		return nil, err
	}

	if s.publisher != nil {
		s.publisher.PublishServerUpdate(UpdateEvent{
			ServerID: updated.ID,
			Server:   *updated,
		})
	}

	return updated, nil
}

func (s *Service) Update(ctx context.Context, id string, name string, iconURL *string, actorID string) (*Server, error) {
	if name == "" {
		return nil, errors.New("name is required")
	}

	srv, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New("server not found")
	}

	icon := srv.IconURL
	if iconURL != nil {
		icon = *iconURL
	}
	mark := &audit.Mark{ServerID: id, ActorID: actorID, Action: audit.ServerUpdate}
	if err := s.repository.Update(ctx, id, name, icon, mark); err != nil {
		return nil, err
	}

	updated, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if s.publisher != nil {
		s.publisher.PublishServerUpdate(UpdateEvent{
			ServerID: srv.ID,
			Server:   *updated,
		})
	}

	return updated, nil
}

// SetIcon troca o ícone (nil tira), avisa os membros com server:update e
// devolve o ícone antigo para quem chama apagar o arquivo.
func (s *Service) SetIcon(ctx context.Context, id string, url *string, actorID string) (*Server, *string, error) {
	action := audit.ServerIconUpdate
	if url == nil {
		action = audit.ServerIconRemove
	}
	mark := &audit.Mark{ServerID: id, ActorID: actorID, Action: action}
	old, err := s.repository.SetIcon(ctx, id, url, mark)
	if err != nil {
		return nil, nil, errors.New("server not found")
	}
	updated, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if s.publisher != nil {
		s.publisher.PublishServerUpdate(UpdateEvent{ServerID: updated.ID, Server: *updated})
	}
	return updated, old, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	srv, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return errors.New("server not found")
	}

	if err := s.repository.Delete(ctx, id); err != nil {
		return err
	}

	if s.publisher != nil {
		s.publisher.PublishServerDelete(DeleteEvent{
			ServerID: srv.ID,
		})
	}

	return nil
}
