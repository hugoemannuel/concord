package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestSecretFromEnv(t *testing.T) {
	strong := strings.Repeat("a1", 16)
	for _, tc := range []struct {
		name  string
		value string
		ok    bool
	}{
		{"sem a variável o backend não sobe", "", false},
		{"curto demais", "segredo-de-teste", false},
		{"o exemplo do .env.example", ExampleSecret, false},
		{"32 bytes ou mais", strong, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("JWT_SECRET", tc.value)
			got, err := SecretFromEnv()
			if tc.ok {
				if err != nil || string(got) != tc.value {
					t.Fatalf("SecretFromEnv = %q, %v", got, err)
				}
				return
			}
			if !errors.Is(err, ErrWeakSecret) || got != nil {
				t.Fatalf("SecretFromEnv = %q, %v; quer ErrWeakSecret", got, err)
			}
			if strings.Contains(err.Error(), tc.value) && tc.value != "" {
				t.Errorf("a mensagem de erro mostra o segredo: %v", err)
			}
		})
	}
}
