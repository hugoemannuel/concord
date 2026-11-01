package auth

import (
	"context"
	"fmt"
)

// Versão da sessão (docs/adr/0039-revogacao-de-sessao.md): o token de acesso
// leva users.token_version e só vale enquanto ela não mudar.

// SetSessionVersions liga a conferência da versão (cache na frente do banco).
func (s *Service) SetSessionVersions(versions *VersionCache) {
	s.versions = versions
}

// OnSessionsRevoked roda depois de RevokeAllSessions (ex.: derrubar o WS).
func (s *Service) OnSessionsRevoked(fn func(userID string)) {
	s.onRevoked = append(s.onRevoked, fn)
}

func (s *Service) currentVersion(ctx context.Context, userID string) (int, error) {
	if s.versions == nil {
		return 0, nil
	}
	return s.versions.Current(ctx, userID)
}

// CheckSession: o token de acesso é da versão atual? Só o de acesso tem
// versão (visitante e mídia têm vida própria). ErrSessionRevoked = recuse com
// 401; outro erro é do banco (não derrube a sessão por isso).
func (s *Service) CheckSession(ctx context.Context, claims *Claims) error {
	if claims.Type != "access" {
		return nil
	}
	version, err := s.currentVersion(ctx, claims.UserID)
	if err != nil {
		return err
	}
	if claims.Version != version {
		return ErrSessionRevoked
	}
	return nil
}

// RevokeAllSessions encerra todas as sessões da conta: incrementa a versão
// (os tokens de acesso emitidos param de valer) e apaga os refresh tokens.
func (s *Service) RevokeAllSessions(ctx context.Context, userID string) error {
	if err := s.repository.RevokeAll(ctx, userID); err != nil {
		return fmt.Errorf("encerrar sessões: %w", err)
	}
	s.ForgetSession(userID)
	for _, fn := range s.onRevoked {
		fn(userID)
	}
	return nil
}

// ForgetSession tira a conta do cache de versões (revogou ou excluiu a conta).
func (s *Service) ForgetSession(userID string) {
	if s.versions != nil {
		s.versions.Forget(userID)
	}
}
