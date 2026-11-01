package server

import (
	"context"
	"errors"
)

// Transferir a posse do servidor (como no Discord): o dono passa o servidor
// para outro membro. É o caminho para quem quer excluir a conta sem apagar um
// servidor que tem gente (docs/adr/0038-excluir-a-propria-conta.md).

var (
	ErrServerNotFound  = errors.New("servidor não encontrado")
	ErrNotServerOwner  = errors.New("só o dono pode transferir o servidor")
	ErrInvalidNewOwner = errors.New("o novo dono precisa ser outro membro do servidor (bots não podem)")
)

type ownershipStore interface {
	FindByID(ctx context.Context, id string) (*Server, error)
	TransferOwner(ctx context.Context, serverID, fromID, toID string) (bool, error)
}

type serverUpdates interface {
	PublishServerUpdate(event UpdateEvent)
}

type OwnershipService struct {
	store   ownershipStore
	updates serverUpdates
}

func NewOwnershipService(store ownershipStore, updates serverUpdates) *OwnershipService {
	return &OwnershipService{store: store, updates: updates}
}

// Transfer passa o servidor de actorID (que precisa ser o dono) para toID.
func (s *OwnershipService) Transfer(ctx context.Context, serverID, actorID, toID string) (*Server, error) {
	srv, err := s.store.FindByID(ctx, serverID)
	if err != nil {
		return nil, ErrServerNotFound
	}
	if srv.OwnerID != actorID {
		return nil, ErrNotServerOwner
	}
	if toID == actorID {
		return nil, ErrInvalidNewOwner
	}
	ok, err := s.store.TransferOwner(ctx, serverID, actorID, toID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInvalidNewOwner
	}
	srv.OwnerID = toID
	s.updates.PublishServerUpdate(UpdateEvent{ServerID: srv.ID, Server: *srv})
	return srv, nil
}
