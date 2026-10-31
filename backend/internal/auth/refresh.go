package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Refresh tokens: emitir, renovar (uso único) e sair. No banco fica só o
// sha256 do token (docs/adr/0039): um vazamento do banco ou de um backup não
// dá sessão a ninguém.

const refreshTTL = 30 * 24 * time.Hour

// ErrInvalidRefresh: refresh token inválido, vencido ou já usado.
var ErrInvalidRefresh = errors.New("refresh token not found or already used")

// hashRefreshToken é o que vai para refresh_tokens.token_hash (a migration
// 000185 converte os antigos com o mesmo cálculo em SQL).
func hashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Service) GenerateRefreshToken(ctx context.Context, userID string) (string, error) {
	expiresAt := time.Now().Add(refreshTTL)
	claims := Claims{
		UserID: userID,
		Type:   "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}
	tokenString, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return "", err
	}
	if err := s.repository.SaveRefreshToken(ctx, uuid.New().String(), hashRefreshToken(tokenString), userID, expiresAt); err != nil {
		return "", err
	}
	return tokenString, nil
}

// RefreshTokens troca um refresh token por um par novo. O antigo é consumido
// num DELETE … RETURNING: dois usos ao mesmo tempo, só um ganha.
func (s *Service) RefreshTokens(ctx context.Context, refreshToken string) (string, string, error) {
	claims, err := s.ValidateToken(refreshToken)
	if err != nil || claims.Type != "refresh" {
		return "", "", ErrInvalidRefresh
	}
	userID, err := s.repository.ConsumeRefreshToken(ctx, hashRefreshToken(refreshToken))
	if err != nil {
		return "", "", err
	}
	if userID != claims.UserID {
		return "", "", ErrInvalidRefresh
	}
	access, err := s.GenerateAccessToken(ctx, userID)
	if err != nil {
		return "", "", err
	}
	refresh, err := s.GenerateRefreshToken(ctx, userID)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// Logout sai deste dispositivo (apaga o refresh token dele). Sem o token
// (apps antigos), apaga todos os refresh tokens da conta, como antes.
func (s *Service) Logout(ctx context.Context, userID, refreshToken string) error {
	if refreshToken == "" {
		return s.repository.DeleteAllUserRefreshTokens(ctx, userID)
	}
	return s.repository.DeleteRefreshToken(ctx, userID, hashRefreshToken(refreshToken))
}
