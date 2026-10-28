package audit

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

type fakePermissions struct{ err error }

func (p fakePermissions) Require(_ context.Context, _, _ string, want int64) error {
	if want != permission.ViewAuditLog {
		panic("permissão incorreta")
	}
	return p.err
}

type fakeLister struct {
	entries []Entry
	called  bool
}

func (l *fakeLister) List(_ context.Context, _ string, _ Filter) ([]Entry, error) {
	l.called = true
	return l.entries, nil
}

func TestListExigePermissao(t *testing.T) {
	l := &fakeLister{}
	s := &Service{repository: l, perms: fakePermissions{err: permission.ErrMissingPermission}}
	_, err := s.List(context.Background(), "servidor", "usuario", Filter{})
	if !errors.Is(err, permission.ErrMissingPermission) || l.called {
		t.Fatalf("acesso negado: err=%v, consultou=%v", err, l.called)
	}
}

func TestListPaginacao(t *testing.T) {
	l := &fakeLister{entries: []Entry{{ID: 3}, {ID: 2}, {ID: 1}}}
	s := &Service{repository: l, perms: fakePermissions{}}
	page, err := s.List(context.Background(), "servidor", "usuario", Filter{Limit: 2})
	if err != nil || len(page.Entries) != 2 || page.NextBefore == nil || *page.NextBefore != 2 {
		t.Fatalf("página=%+v, err=%v", page, err)
	}
}

func TestListRejeitaFiltroInvalido(t *testing.T) {
	l := &fakeLister{}
	s := &Service{repository: l, perms: fakePermissions{}}
	_, err := s.List(context.Background(), "servidor", "usuario", Filter{Action: "desconhecida"})
	if !errors.Is(err, ErrInvalidFilter) || l.called {
		t.Fatalf("filtro inválido: err=%v, consultou=%v", err, l.called)
	}
}
