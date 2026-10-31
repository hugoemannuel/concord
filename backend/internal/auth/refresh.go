package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Refresh tokens: emitir, renovar (uso único) e sair.

func (s *Service) GenerateRefreshToken(ctx context.Context, userID string) (string, error) {
	claims := Claims{
		UserID: userID,
		Type:   "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(s.secret)
	if err != nil {
		return "", err
	}

	tokenID := uuid.New().String()
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	if err := s.repository.SaveRefreshToken(ctx, tokenID, tokenString, userID, expiresAt); err != nil {
		return "", err
	}

	return tokenString, nil
}

func (s *Service) RefreshTokens(ctx context.Context, refreshToken string) (string, string, error) {
	claims, err := s.ValidateToken(refreshToken)
	if err != nil {
		return "", "", errors.New("invalid refresh token")
	}

	if claims.Type != "refresh" {
		return "", "", errors.New("token is not a refresh token")
	}

	exists, err := s.repository.FindRefreshToken(ctx, refreshToken)
	if err != nil || !exists {
		return "", "", errors.New("refresh token not found or already used")
	}

	if err := s.repository.DeleteRefreshToken(ctx, refreshToken); err != nil {
		return "", "", err
	}

	newAccessToken, err := s.GenerateAccessToken(claims.UserID)
	if err != nil {
		return "", "", err
	}

	newRefreshToken, err := s.GenerateRefreshToken(ctx, claims.UserID)
	if err != nil {
		return "", "", err
	}

	return newAccessToken, newRefreshToken, nil
}

func (s *Service) Logout(ctx context.Context, userID string) error {
	return s.repository.DeleteAllUserRefreshTokens(ctx, userID)
}
