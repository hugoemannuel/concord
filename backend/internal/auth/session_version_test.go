package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeVersions struct {
	versions map[string]int
	calls    int
	err      error
}

func (f *fakeVersions) TokenVersion(_ context.Context, userID string) (int, error) {
	f.calls++
	if f.err != nil {
		return 0, f.err
	}
	v, ok := f.versions[userID]
	if !ok {
		return 0, ErrSessionRevoked
	}
	return v, nil
}

func TestVersionCacheGuardaPorPoucoTempoEEsqueceNaHora(t *testing.T) {
	store := &fakeVersions{versions: map[string]int{"ana": 1}}
	now := time.Unix(0, 0)
	c := NewVersionCache(store, time.Minute)
	c.now = func() time.Time { return now }
	ctx := context.Background()

	for range 3 {
		if v, err := c.Current(ctx, "ana"); err != nil || v != 1 {
			t.Fatalf("Current = %d, %v", v, err)
		}
	}
	if store.calls != 1 {
		t.Fatalf("foi ao banco %d vezes, quer 1 (cache)", store.calls)
	}

	store.versions["ana"] = 2
	c.Forget("ana")
	if v, _ := c.Current(ctx, "ana"); v != 2 {
		t.Fatalf("depois do Forget: %d, quer 2", v)
	}

	store.versions["ana"] = 3
	now = now.Add(2 * time.Minute)
	if v, _ := c.Current(ctx, "ana"); v != 3 {
		t.Fatalf("depois do TTL: %d, quer 3", v)
	}
}

func TestVersionCacheNaoGuardaErroDoBanco(t *testing.T) {
	store := &fakeVersions{err: errors.New("banco caiu")}
	c := NewVersionCache(store, time.Minute)
	ctx := context.Background()
	if _, err := c.Current(ctx, "ana"); err == nil || errors.Is(err, ErrSessionRevoked) {
		t.Fatalf("Current = %v, quer o erro do banco (não revogada)", err)
	}
	store.err = nil
	store.versions = map[string]int{"ana": 4}
	if v, err := c.Current(ctx, "ana"); err != nil || v != 4 {
		t.Fatalf("Current depois do banco voltar = %d, %v", v, err)
	}
}

func TestCheckSession(t *testing.T) {
	store := &fakeVersions{versions: map[string]int{"ana": 2}}
	s := NewService(nil, []byte("segredo-de-teste"))
	s.SetSessionVersions(NewVersionCache(store, time.Minute))
	ctx := context.Background()

	for _, tc := range []struct {
		name   string
		claims Claims
		want   error
	}{
		{"versão atual", Claims{UserID: "ana", Type: "access", Version: 2}, nil},
		{"versão antiga (saiu de todos os dispositivos)", Claims{UserID: "ana", Type: "access", Version: 1}, ErrSessionRevoked},
		{"conta excluída", Claims{UserID: "zé", Type: "access"}, ErrSessionRevoked},
		{"visitante não tem versão", Claims{UserID: "zé", Type: TokenGuest}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := s.CheckSession(ctx, &tc.claims); !errors.Is(err, tc.want) {
				t.Fatalf("CheckSession = %v, quer %v", err, tc.want)
			}
		})
	}
}
