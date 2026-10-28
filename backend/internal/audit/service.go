package audit

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

var ErrInvalidFilter = errors.New("filtro de auditoria inválido")

const (
	defaultLimit = 50
	maxLimit     = 100
)

// PermissionChecker é o que a consulta usa do permission.Service.
type PermissionChecker interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
}

type lister interface {
	List(ctx context.Context, serverID string, f Filter) ([]Entry, error)
}

// Page: uma página do registro. NextBefore (nil na última) é o cursor da próxima.
type Page struct {
	Entries    []Entry `json:"entries"`
	NextBefore *int64  `json:"next_before"`
}

type Service struct {
	repository lister
	perms      PermissionChecker
}

func AuditService(repository *Repository, perms PermissionChecker) *Service {
	return &Service{repository: repository, perms: perms}
}

// List devolve uma página do registro para quem tem VIEW_AUDIT_LOG (dono e
// Administrador têm todas as permissões).
func (s *Service) List(ctx context.Context, serverID, userID string, f Filter) (Page, error) {
	if err := s.perms.Require(ctx, serverID, userID, permission.ViewAuditLog); err != nil {
		return Page{}, err
	}
	f, err := f.normalized()
	if err != nil {
		return Page{}, err
	}
	limit := f.Limit
	f.Limit = limit + 1

	entries, err := s.repository.List(ctx, serverID, f)
	if err != nil {
		return Page{}, err
	}
	page := Page{Entries: entries}
	if len(entries) > limit {
		page.Entries = entries[:limit]
		next := page.Entries[limit-1].ID
		page.NextBefore = &next
	}
	return page, nil
}

func (f Filter) normalized() (Filter, error) {
	if f.ActorID != "" {
		if _, err := uuid.Parse(f.ActorID); err != nil {
			return f, ErrInvalidFilter
		}
	}
	if f.Action != "" && !ValidAction(f.Action) {
		return f, ErrInvalidFilter
	}
	if f.Before < 0 || f.Limit < 0 {
		return f, ErrInvalidFilter
	}
	if f.Limit == 0 {
		f.Limit = defaultLimit
	}
	if f.Limit > maxLimit {
		f.Limit = maxLimit
	}
	return f, nil
}

// ValidAction: a ação está no catálogo.
func ValidAction(a Action) bool {
	for _, known := range Actions {
		if a == known {
			return true
		}
	}
	return false
}
