package savedprofile

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/user"

	"github.com/jackc/pgx/v5"
)

// store é o que o service usa do repositório.
type store interface {
	List(ctx context.Context, userID string) ([]SavedProfile, error)
	Find(ctx context.Context, userID, id string) (*SavedProfile, error)
	Create(ctx context.Context, userID, name string, snap user.ProfileSnapshot) (*SavedProfile, error)
	Rename(ctx context.Context, userID, id, name string) (*SavedProfile, error)
	// Overwrite troca o snapshot e devolve o novo perfil salvo e o anterior.
	Overwrite(ctx context.Context, userID, id string, snap user.ProfileSnapshot) (*SavedProfile, *SavedProfile, error)
	Delete(ctx context.Context, userID, id string) (*SavedProfile, error)
}

// userFinder lê o perfil atual (user.Service).
type userFinder interface {
	FindByID(ctx context.Context, id string) (*user.User, error)
}

// snapshotApplier troca o perfil e avisa todo mundo (user.ProfileService).
type snapshotApplier interface {
	ApplySnapshot(ctx context.Context, userID string, snap user.ProfileSnapshot) (*user.User, []*string, error)
}

type Service struct {
	store    store
	users    userFinder
	profiles snapshotApplier
}

func NewService(store store, users userFinder, profiles snapshotApplier) *Service {
	return &Service{store: store, users: users, profiles: profiles}
}

// validName arruma as pontas e confere tamanho e caracteres (as regras do
// nome de exibição).
func validName(raw string) (string, error) {
	name, err := user.NormalizeName(raw, MaxNameLength)
	if err != nil {
		return "", ErrInvalidName
	}
	return name, nil
}

func (s *Service) List(ctx context.Context, userID string) ([]SavedProfile, error) {
	return s.store.List(ctx, userID)
}

// Save guarda o perfil atual com o nome dado. Só salva o que dá para aplicar
// de volta.
func (s *Service) Save(ctx context.Context, userID, rawName string) (*SavedProfile, error) {
	name, err := validName(rawName)
	if err != nil {
		return nil, err
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, userNotFound(err)
	}
	snap, err := user.ValidateSnapshot(u.Snapshot())
	if err != nil {
		return nil, err
	}
	return s.store.Create(ctx, userID, name, snap)
}

func (s *Service) Rename(ctx context.Context, userID, id, rawName string) (*SavedProfile, error) {
	name, err := validName(rawName)
	if err != nil {
		return nil, err
	}
	return s.store.Rename(ctx, userID, id, name)
}

// Overwrite sobrescreve o perfil salvo com o perfil atual, mantendo nome e
// posição. Devolve também o perfil salvo anterior (quem chama solta a mídia
// que ele usava e agora ninguém mais usa).
func (s *Service) Overwrite(ctx context.Context, userID, id string) (*SavedProfile, *SavedProfile, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, nil, userNotFound(err)
	}
	snap, err := user.ValidateSnapshot(u.Snapshot())
	if err != nil {
		return nil, nil, err
	}
	return s.store.Overwrite(ctx, userID, id, snap)
}

// Delete apaga e devolve o perfil salvo (quem chama solta a mídia dele).
func (s *Service) Delete(ctx context.Context, userID, id string) (*SavedProfile, error) {
	return s.store.Delete(ctx, userID, id)
}

// Apply troca o perfil atual pelo salvo. Devolve as URLs de mídia que saíram.
func (s *Service) Apply(ctx context.Context, userID, id string) (*user.User, []*string, error) {
	sp, err := s.store.Find(ctx, userID, id)
	if err != nil {
		return nil, nil, err
	}
	return s.profiles.ApplySnapshot(ctx, userID, sp.ProfileSnapshot)
}

// userNotFound: o user.Repository devolve pgx.ErrNoRows; o handler entende
// user.ErrUserNotFound.
func userNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return user.ErrUserNotFound
	}
	return err
}
