package audit

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

var ErrInvalidFilter = errors.New("filtro do registro de auditoria inválido")

const (
	defaultLimit = 50
	maxLimit     = 100
)

// PermissionChecker é o que a leitura usa do permission.Service.
type PermissionChecker interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
}

type lister interface {
	List(ctx context.Context, serverID string, f Filter) ([]Entry, error)
}

// Service lê o registro para quem tem VIEW_AUDIT_LOG no servidor.
type Service struct {
	entries lister
	perms   PermissionChecker
}

func NewService(entries lister, perms PermissionChecker) *Service {
	return &Service{entries: entries, perms: perms}
}

// List devolve uma página do mais recente para o mais antigo. Sem permissão
// (ou servidor de outro) nem chega no banco.
func (s *Service) List(ctx context.Context, serverID, userID string, f Filter) (Page, error) {
	if uuid.Validate(serverID) != nil {
		return Page{}, permission.ErrNotMember // id que nem é de servidor: como o de outro
	}
	if err := s.perms.Require(ctx, serverID, userID, permission.ViewAuditLog); err != nil {
		return Page{}, err
	}
	f, err := normalize(f)
	if err != nil {
		return Page{}, err
	}
	limit := f.Limit
	f.Limit = limit + 1 // uma a mais diz se há próxima página
	entries, err := s.entries.List(ctx, serverID, f)
	if err != nil {
		return Page{}, err
	}
	return paginate(entries, limit), nil
}

func paginate(entries []Entry, limit int) Page {
	if entries == nil {
		entries = []Entry{}
	}
	if len(entries) <= limit {
		return Page{Entries: entries}
	}
	next := entries[limit-1].ID
	return Page{Entries: entries[:limit], NextBefore: &next}
}

// normalize confere o filtro e aplica o limite padrão e o teto.
func normalize(f Filter) (Filter, error) {
	if f.Before < 0 || f.Limit < 0 {
		return f, ErrInvalidFilter
	}
	if f.Action != "" && !ValidAction(f.Action) {
		return f, ErrInvalidFilter
	}
	if f.ActorID != "" && uuid.Validate(f.ActorID) != nil {
		return f, ErrInvalidFilter
	}
	f.Limit = clampLimit(f.Limit)
	return f, nil
}

func clampLimit(limit int) int {
	if limit == 0 {
		return defaultLimit
	}
	return min(limit, maxLimit)
}
