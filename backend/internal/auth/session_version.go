package auth

import (
	"context"
	"errors"
	"sync"
	"time"
)

// ErrSessionRevoked: o token é de uma versão antiga da sessão (saiu de todos
// os dispositivos, redefiniu a senha) ou a conta não existe mais.
var ErrSessionRevoked = errors.New("sessão encerrada")

// SessionVersionTTL: quanto a versão fica em cache. A revogação feita neste
// processo esquece na hora (Forget); o TTL só limita o que ficaria velho se a
// versão mudasse por fora (outro processo, SQL na mão).
const SessionVersionTTL = time.Minute

// maxCachedVersions: acima disso, as entradas vencidas saem antes de gravar.
const maxCachedVersions = 10000

type versionStore interface {
	// TokenVersion devolve ErrSessionRevoked se a conta não existe.
	TokenVersion(ctx context.Context, userID string) (int, error)
}

type cachedVersion struct {
	version int
	revoked bool
	at      time.Time
}

// VersionCache guarda users.token_version por pouco tempo, para o middleware
// e o WebSocket não irem ao banco a cada pedido (docs/adr/0039).
type VersionCache struct {
	store   versionStore
	ttl     time.Duration
	now     func() time.Time
	mu      sync.Mutex
	entries map[string]cachedVersion
}

func NewVersionCache(store versionStore, ttl time.Duration) *VersionCache {
	return &VersionCache{store: store, ttl: ttl, now: time.Now, entries: map[string]cachedVersion{}}
}

// Current: a versão atual da conta (ErrSessionRevoked se ela não existe).
// Erro do banco não fica em cache e não vira "revogada".
func (c *VersionCache) Current(ctx context.Context, userID string) (int, error) {
	if entry, ok := c.fresh(userID); ok {
		return entry.version, revokedErr(entry.revoked)
	}
	version, err := c.store.TokenVersion(ctx, userID)
	revoked := errors.Is(err, ErrSessionRevoked)
	if err != nil && !revoked {
		return 0, err
	}
	c.save(userID, cachedVersion{version: version, revoked: revoked, at: c.now()})
	return version, revokedErr(revoked)
}

// Forget faz a próxima consulta ir ao banco (depois de incrementar a versão).
func (c *VersionCache) Forget(userID string) {
	c.mu.Lock()
	delete(c.entries, userID)
	c.mu.Unlock()
}

func (c *VersionCache) fresh(userID string) (cachedVersion, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[userID]
	return entry, ok && c.now().Sub(entry.at) < c.ttl
}

func (c *VersionCache) save(userID string, entry cachedVersion) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= maxCachedVersions {
		for id, e := range c.entries {
			if entry.at.Sub(e.at) >= c.ttl {
				delete(c.entries, id)
			}
		}
	}
	c.entries[userID] = entry
}

func revokedErr(revoked bool) error {
	if revoked {
		return ErrSessionRevoked
	}
	return nil
}
