package audit

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

const (
	srv1 = "11111111-1111-4111-8111-111111111111"
	srv2 = "22222222-2222-4222-8222-222222222222"
)

// fakePerms: só quem está em allowed tem VIEW_AUDIT_LOG; outro servidor = não membro.
type fakePerms struct {
	server  string
	allowed map[string]bool
	members map[string]bool
}

func (p fakePerms) Require(_ context.Context, serverID, userID string, want int64) error {
	if want != permission.ViewAuditLog {
		return errors.New("permissão errada")
	}
	if serverID != p.server || !p.members[userID] {
		return permission.ErrNotMember
	}
	if !p.allowed[userID] {
		return permission.ErrMissingPermission
	}
	return nil
}

type fakeLister struct {
	entries  []Entry
	called   bool
	serverID string
	filter   Filter
}

func (l *fakeLister) List(_ context.Context, serverID string, f Filter) ([]Entry, error) {
	l.called, l.serverID, l.filter = true, serverID, f
	return l.entries, nil
}

func newTestService(l *fakeLister) *Service {
	perms := fakePerms{
		server:  srv1,
		allowed: map[string]bool{"auditor": true},
		members: map[string]bool{"auditor": true, "comum": true},
	}
	return NewService(l, perms)
}

func TestServiceListAutorizacao(t *testing.T) {
	cases := []struct {
		name, server, user string
		want               error
	}{
		{"com permissão", srv1, "auditor", nil},
		{"membro sem permissão", srv1, "comum", permission.ErrMissingPermission},
		{"de fora", srv1, "zeca", permission.ErrNotMember},
		{"servidor de outro", srv2, "auditor", permission.ErrNotMember},
		{"id que não é de servidor", "", "auditor", permission.ErrNotMember},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			l := &fakeLister{}
			_, err := newTestService(l).List(context.Background(), tc.server, tc.user, Filter{})
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if l.called != (tc.want == nil) {
				t.Fatalf("consultou o banco = %v sem permissão", l.called)
			}
		})
	}
}

func TestServiceListPagina(t *testing.T) {
	l := &fakeLister{entries: []Entry{{ID: 9}, {ID: 7}, {ID: 4}}}
	page, err := newTestService(l).List(context.Background(), srv1, "auditor", Filter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if l.filter.Limit != 3 {
		t.Fatalf("pediu %d linhas, quer limite+1 = 3", l.filter.Limit)
	}
	if len(page.Entries) != 2 || page.NextBefore == nil || *page.NextBefore != 7 {
		t.Fatalf("página = %+v next=%v", page.Entries, page.NextBefore)
	}

	l = &fakeLister{entries: []Entry{{ID: 2}}}
	page, _ = newTestService(l).List(context.Background(), srv1, "auditor", Filter{Limit: 2})
	if page.NextBefore != nil || len(page.Entries) != 1 {
		t.Fatalf("última página: %+v next=%v", page.Entries, page.NextBefore)
	}
}

func TestServiceListSemLinhasDevolveListaVazia(t *testing.T) {
	page, err := newTestService(&fakeLister{}).List(context.Background(), srv1, "auditor", Filter{})
	if err != nil || page.Entries == nil {
		t.Fatalf("entries = %#v err=%v, quer [] (o app lê como lista)", page.Entries, err)
	}
}

func TestNormalizeFilter(t *testing.T) {
	cases := []struct {
		name      string
		in        Filter
		wantLimit int
		wantErr   bool
	}{
		{"padrão", Filter{}, defaultLimit, false},
		{"teto", Filter{Limit: 1000}, maxLimit, false},
		{"ação conhecida", Filter{Action: MemberBan}, defaultLimit, false},
		{"ação desconhecida", Filter{Action: "x"}, 0, true},
		{"autor inválido", Filter{ActorID: "não-é-uuid"}, 0, true},
		{"autor uuid", Filter{ActorID: "6f1c1d1e-8a3b-4b8e-9f00-0123456789ab"}, defaultLimit, false},
		{"cursor negativo", Filter{Before: -1}, 0, true},
		{"limite negativo", Filter{Limit: -5}, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalize(tc.in)
			if tc.wantErr {
				if !errors.Is(err, ErrInvalidFilter) {
					t.Fatalf("err = %v, quer ErrInvalidFilter", err)
				}
				return
			}
			if err != nil || got.Limit != tc.wantLimit {
				t.Fatalf("limit = %d err = %v, quer %d", got.Limit, err, tc.wantLimit)
			}
		})
	}
}
