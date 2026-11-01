package auth

import (
	"errors"
	"fmt"
	"os"
)

// MinSecretBytes: o HS256 pede uma chave de pelo menos 256 bits.
const MinSecretBytes = 32

// ExampleSecret é o valor de backend/.env.example (nunca vale em produção).
const ExampleSecret = "troque-por-um-segredo-forte-aqui"

// ErrWeakSecret: JWT_SECRET ausente, curto ou o do exemplo. Antes havia um
// segredo padrão no código, e um deploy sem a variável aceitava tokens
// forjados por qualquer um; agora o backend não sobe.
var ErrWeakSecret = errors.New("JWT_SECRET ausente ou fraco")

// SecretFromEnv lê o JWT_SECRET. A mensagem de erro nunca traz o valor.
func SecretFromEnv() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	switch {
	case secret == "":
		return nil, fmt.Errorf("%w: defina JWT_SECRET (ex.: openssl rand -hex 32)", ErrWeakSecret)
	case secret == ExampleSecret:
		return nil, fmt.Errorf("%w: JWT_SECRET ainda é o valor do .env.example; gere um com openssl rand -hex 32", ErrWeakSecret)
	case len(secret) < MinSecretBytes:
		return nil, fmt.Errorf("%w: JWT_SECRET tem %d bytes, precisa de pelo menos %d (openssl rand -hex 32)", ErrWeakSecret, len(secret), MinSecretBytes)
	}
	return []byte(secret), nil
}
