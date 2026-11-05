package level

import (
	"context"
	"sync"
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/relationship"
)

const (
	// DefaultRankingLimit e MaxRankingLimit: o ranking global é o top 100.
	DefaultRankingLimit = 100
	MaxRankingLimit     = 100
	// rankingTTL: o top muda devagar (XP sai por minuto completo em call), então
	// uma consulta por minuto atende todos os clientes.
	rankingTTL = 60 * time.Second
)

// RankingEntry é uma linha do ranking global. Position começa em 1. Username
// vem vazio para quem não tem vínculo com quem pediu (Relationship = none).
type RankingEntry struct {
	Position     int               `json:"position"`
	UserID       string            `json:"user_id"`
	Username     string            `json:"username"`
	Relationship relationship.Kind `json:"relationship"`
	DisplayName  string            `json:"display_name"`
	AvatarURL    *string           `json:"avatar_url"`
	NameStyle    namestyle.Style   `json:"name_style"`
	cosmetics.Look
	Level        int               `json:"level"`
	XP           int64             `json:"xp"`
}

// MyRank é a posição de quem pediu o ranking, mesmo fora do top.
type MyRank struct {
	Position int   `json:"position"`
	Level    int   `json:"level"`
	XP       int64 `json:"xp"`
}

// Ranking é a resposta de GET /levels/ranking. Me é nulo para quem ainda não
// tem XP (ou é bot): não há posição a mostrar.
type Ranking struct {
	Entries []RankingEntry `json:"entries"`
	Me      *MyRank        `json:"me"`
}

type rankingStore interface {
	// TopRanking devolve até limit pessoas, da maior para a menor, sem Position e Level.
	TopRanking(ctx context.Context, limit int) ([]RankingEntry, error)
	// RankOf devolve a posição e o XP de userID; ok é falso se ele não entra no ranking.
	RankOf(ctx context.Context, userID string) (MyRank, bool, error)
}

// RankingService monta o ranking global com um cache curto do top; o filtro
// de privacidade de quem pede vem depois do cache.
type RankingService struct {
	store rankingStore
	links linkResolver
	ttl   time.Duration
	now   func() time.Time

	mu       sync.Mutex
	cached   []RankingEntry
	cachedAt time.Time
}

func RankingServiceFor(repository *Repository, links linkResolver) *RankingService {
	return &RankingService{store: repository, links: links, ttl: rankingTTL, now: time.Now}
}

func clampRankingLimit(limit int) int {
	if limit <= 0 {
		return DefaultRankingLimit
	}
	return min(limit, MaxRankingLimit)
}

// Get devolve o top `limit` e a posição de userID.
func (s *RankingService) Get(ctx context.Context, userID string, limit int) (Ranking, error) {
	limit = clampRankingLimit(limit)
	top, err := s.top(ctx)
	if err != nil {
		return Ranking{}, err
	}
	me, err := s.myRank(ctx, userID, top)
	if err != nil {
		return Ranking{}, err
	}
	entries, err := forViewer(ctx, s.links, userID, top[:min(limit, len(top))])
	if err != nil {
		return Ranking{}, err
	}
	return Ranking{Entries: entries, Me: me}, nil
}

// top devolve o top máximo do cache, recarregando quando vence. Erro não vai
// para o cache.
func (s *RankingService) top(ctx context.Context) ([]RankingEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && s.now().Sub(s.cachedAt) < s.ttl {
		return s.cached, nil
	}
	rows, err := s.store.TopRanking(ctx, MaxRankingLimit)
	if err != nil {
		return nil, err
	}
	top := make([]RankingEntry, len(rows))
	for i, row := range rows {
		row.Position = i + 1
		row.Level, _, _ = FromXP(row.XP)
		top[i] = row
	}
	s.cached, s.cachedAt = top, s.now()
	return top, nil
}

func (s *RankingService) myRank(ctx context.Context, userID string, top []RankingEntry) (*MyRank, error) {
	for _, e := range top {
		if e.UserID == userID {
			return &MyRank{Position: e.Position, Level: e.Level, XP: e.XP}, nil
		}
	}
	rank, ok, err := s.store.RankOf(ctx, userID)
	if err != nil || !ok {
		return nil, err
	}
	rank.Level, _, _ = FromXP(rank.XP)
	return &rank, nil
}
