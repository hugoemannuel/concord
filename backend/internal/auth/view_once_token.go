package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ViewOnceTokenTTL é a validade do token que abre UMA mídia de visualização
// única. Curto de propósito: a abertura é registrada no servidor e o token só
// serve para o arquivo daquele anexo.
const ViewOnceTokenTTL = 5 * time.Minute

var ErrNotViewOnceToken = errors.New("token is not a view-once token for this attachment")

func (s *Service) GenerateViewOnceToken(userID, attachmentID string) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(ViewOnceTokenTTL)
	claims := Claims{
		UserID:       userID,
		Type:         "view_once",
		AttachmentID: attachmentID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// VerifyViewOnceToken só aceita token view_once emitido para este anexo.
func (s *Service) VerifyViewOnceToken(token, attachmentID string) (string, error) {
	claims, err := s.ValidateToken(token)
	if err != nil {
		return "", err
	}
	if claims.Type != "view_once" || attachmentID == "" || claims.AttachmentID != attachmentID {
		return "", ErrNotViewOnceToken
	}
	return claims.UserID, nil
}
