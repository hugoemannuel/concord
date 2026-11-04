package proposal

import (
	"context"
	"errors"
)

var (
	// ErrNotArchivable: só concluída (done) e recusada (rejected) podem ser arquivadas.
	ErrNotArchivable = errors.New("only done or rejected proposals can be archived")
	// ErrArchived: o card arquivado não muda de coluna; desarquive primeiro.
	// (Decisão: impedir é mais simples e previsível que desarquivar sozinho.)
	ErrArchived = errors.New("proposal is archived")
)

// ArchivedPageSize é quantas propostas arquivadas vêm por página.
const ArchivedPageSize = 20

// ArchivedPage é a resposta de GET /proposals/archived.
type ArchivedPage struct {
	Proposals []Proposal `json:"proposals"`
	HasMore   bool       `json:"has_more"`
}

func archivable(status string) bool { return status == StatusDone || status == StatusRejected }

// Archive tira o card concluído/recusado do quadro (só o time tech, como mover
// cards). Repetir é inofensivo. Votos, comentários, imagens, issue e badges
// não mudam: só archived_at.
func (s *Service) Archive(ctx context.Context, id, userID string) (*Proposal, error) {
	if !s.IsTech(userID) {
		return nil, ErrForbidden
	}
	p, err := s.store.Get(ctx, id, nil)
	if err != nil {
		return nil, err
	}
	if !archivable(p.Status) {
		return nil, ErrNotArchivable
	}
	changed, err := s.store.Archive(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	if len(changed) > 0 {
		s.broadcast("proposal:archive", map[string][]string{"ids": changed})
	}
	return s.store.Get(ctx, id, &userID)
}

// ArchiveAll arquiva todas as concluídas (ou recusadas) de uma vez e devolve
// as ids arquivadas; um evento só avisa os outros apps.
func (s *Service) ArchiveAll(ctx context.Context, userID, status string) ([]string, error) {
	if !s.IsTech(userID) {
		return nil, ErrForbidden
	}
	if !archivable(status) {
		return nil, ErrInvalidStatus
	}
	ids, err := s.store.ArchiveByStatus(ctx, status)
	if err != nil {
		return nil, err
	}
	if len(ids) > 0 {
		s.broadcast("proposal:archive", map[string][]string{"ids": ids})
	}
	return ids, nil
}

// Unarchive devolve o card ao quadro (só o time tech); os apps recebem o card inteiro.
func (s *Service) Unarchive(ctx context.Context, id, userID string) (*Proposal, error) {
	if !s.IsTech(userID) {
		return nil, ErrForbidden
	}
	if _, err := s.store.Get(ctx, id, nil); err != nil {
		return nil, err
	}
	changed, err := s.store.Unarchive(ctx, id)
	if err != nil {
		return nil, err
	}
	if changed {
		s.publish("proposal:unarchive", id)
	}
	return s.store.Get(ctx, id, &userID)
}

// Archived lê uma página (0, 1, ...) das arquivadas: qualquer pessoa logada.
func (s *Service) Archived(ctx context.Context, userID, query string, page int) (*ArchivedPage, error) {
	page = max(page, 0)
	list, more, err := s.store.ListArchived(ctx, userID, query, ArchivedPageSize, page*ArchivedPageSize)
	if err != nil {
		return nil, err
	}
	return &ArchivedPage{Proposals: list, HasMore: more}, nil
}
