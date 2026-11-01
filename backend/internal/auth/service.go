package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID string `json:"user_id"`
	Type   string `json:"type"`
	// Version é users.token_version quando o token de acesso foi emitido
	// (docs/adr/0039). Tokens de antes da migration não têm: valem como 0.
	Version int `json:"ver,omitempty"`
	jwt.RegisteredClaims
}

type Service struct {
	repository *Repository
	secret     []byte
	// versions confere a versão da sessão; nil = sem conferência (testes).
	versions  *VersionCache
	onRevoked []func(userID string)
}

// NewService monta o serviço com o segredo dos tokens (SecretFromEnv).
func NewService(repository *Repository, secret []byte) *Service {
	return &Service{
		repository: repository,
		secret:     secret,
	}
}

// GenerateAccessToken emite o token de acesso com a versão atual da sessão.
func (s *Service) GenerateAccessToken(ctx context.Context, userID string) (string, error) {
	version, err := s.currentVersion(ctx, userID)
	if err != nil {
		return "", err
	}
	claims := Claims{
		UserID:  userID,
		Type:    "access",
		Version: version,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
