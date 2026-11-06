package soundboard

import (
	"context"

	"gin-quickstart/backend/internal/call"
)

// favoriteChecker: a pessoa favoritou o som (Repository).
type favoriteChecker interface {
	IsFavorite(ctx context.Context, userID, soundID string) (bool, error)
}

// CallLookup dá à chamada os sons, os favoritos e quem é membro de onde
// (call.SoundLookup).
type CallLookup struct {
	repo      soundRepo
	favorites favoriteChecker
	servers   serverChecker
}

func NewCallLookup(repo soundRepo, favorites favoriteChecker, servers serverChecker) *CallLookup {
	return &CallLookup{repo: repo, favorites: favorites, servers: servers}
}

// IsMember: quem toca é membro do servidor do som (pode tocá-lo em outra
// chamada, docs/adr/0058-sons-de-outros-servidores-na-mesa.md).
func (l *CallLookup) IsMember(ctx context.Context, serverID, userID string) (bool, error) {
	return l.servers.IsMember(ctx, serverID, userID)
}

func (l *CallLookup) IsFavorite(ctx context.Context, userID, soundID string) (bool, error) {
	return l.favorites.IsFavorite(ctx, userID, soundID)
}

func (l *CallLookup) FindSound(ctx context.Context, soundID string) (call.SoundInfo, error) {
	s, err := l.repo.FindByID(ctx, soundID)
	if err != nil {
		return call.SoundInfo{}, err
	}
	return call.SoundInfo{
		ID:         s.ID,
		ServerID:   s.ServerID,
		Name:       s.Name,
		Emoji:      s.Emoji,
		DurationMs: s.DurationMs,
	}, nil
}
