package user

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/relationship"
	"github.com/jackc/pgx/v5"
)

var ErrUserNotFound = errors.New("user not found")

type profileRepo interface {
	FindByID(ctx context.Context, id string) (*User, error)
	UpdateProfile(ctx context.Context, id string, in ProfileInput) (*User, error)
	SetAvatar(ctx context.Context, id string, url *string) (*User, *string, error)
	SetBanner(ctx context.Context, id string, url *string) (*User, *string, error)
	SetEntranceSound(ctx context.Context, id string, url *string) (*User, *string, error)
	SetStatus(ctx context.Context, id string, status string) (*User, error)
	SetNameplate(ctx context.Context, id string, url *string) (*User, *string, error)
	SetDecoration(ctx context.Context, id string, url *string) (*User, *string, error)
	SetNameplateMode(ctx context.Context, id string, mode string) (*User, error)
	ApplySnapshot(ctx context.Context, id string, s ProfileSnapshot) (*User, []*string, error)
}

// ProfileEvents avisa os outros clientes (o hub do websocket implementa).
type ProfileEvents interface {
	// PublishUserUpdate manda o perfil novo para todo mundo conectado.
	PublishUserUpdate(profile PublicProfile)
	// SetUserStatus guarda o status escolhido e avisa a presença.
	SetUserStatus(userID, status string)
	// EffectiveStatus é o status que os outros veem agora.
	EffectiveStatus(userID string) string
}

// ProfileService edita o perfil e avisa quem precisa ver a mudança.
type ProfileService struct {
	repo   profileRepo
	events ProfileEvents
	links  linkResolver
}

func NewProfileService(repo profileRepo, events ProfileEvents, links linkResolver) *ProfileService {
	return &ProfileService{repo: repo, events: events, links: links}
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	}
	return err
}

// Profile é o cartão de perfil. A própria pessoa vê o status escolhido
// (ex.: invisível); os outros veem o efetivo, e sem o @ se não tiverem
// vínculo com ela.
func (s *ProfileService) Profile(ctx context.Context, viewerID, userID string) (PublicProfile, error) {
	u, err := s.repo.FindByID(ctx, userID)
	if err != nil {
		return PublicProfile{}, notFound(err)
	}
	if bot.IsBot(userID) {
		// Os bots não têm websocket: não têm presença para consultar.
		p := u.Public("online")
		p.IsBot = true
		return p, nil
	}
	if viewerID == userID {
		return forViewer(u.Public(u.Status), relationship.Self), nil
	}
	kind, err := s.links.Between(ctx, viewerID, userID)
	if err != nil {
		return PublicProfile{}, err
	}
	return forViewer(u.Public(s.events.EffectiveStatus(userID)), kind), nil
}

func (s *ProfileService) UpdateProfile(ctx context.Context, userID string, in ProfileInput) (*User, error) {
	clean, err := ValidateProfile(in)
	if err != nil {
		return nil, err
	}
	u, err := s.repo.UpdateProfile(ctx, userID, clean)
	if err != nil {
		return nil, notFound(err)
	}
	s.publish(u)
	return u, nil
}

// SetAvatar grava a URL nova (nil remove) e devolve a antiga para quem chama
// apagar o arquivo.
func (s *ProfileService) SetAvatar(ctx context.Context, userID string, url *string) (*User, *string, error) {
	return s.swap(ctx, userID, url, s.repo.SetAvatar)
}

func (s *ProfileService) SetBanner(ctx context.Context, userID string, url *string) (*User, *string, error) {
	return s.swap(ctx, userID, url, s.repo.SetBanner)
}

// SetEntranceSound grava a URL do som de entrada (nil volta ao padrão) e
// devolve a antiga para quem chama apagar o arquivo.
func (s *ProfileService) SetEntranceSound(ctx context.Context, userID string, url *string) (*User, *string, error) {
	return s.swap(ctx, userID, url, s.repo.SetEntranceSound)
}

func (s *ProfileService) swap(
	ctx context.Context,
	userID string,
	url *string,
	set func(context.Context, string, *string) (*User, *string, error),
) (*User, *string, error) {
	u, old, err := set(ctx, userID, url)
	if err != nil {
		return nil, nil, notFound(err)
	}
	s.publish(u)
	return u, old, nil
}

func (s *ProfileService) SetStatus(ctx context.Context, userID, status string) (*User, error) {
	if !ValidStatus(status) {
		return nil, ErrInvalidStatus
	}
	u, err := s.repo.SetStatus(ctx, userID, status)
	if err != nil {
		return nil, notFound(err)
	}
	s.events.SetUserStatus(userID, status)
	return u, nil
}

func (s *ProfileService) publish(u *User) {
	s.events.PublishUserUpdate(u.Public(s.events.EffectiveStatus(u.ID)))
}
