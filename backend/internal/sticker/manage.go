package sticker

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
)

// manageable: o item do servidor, se quem pede o enviou ou modera expressões.
func (h *Handler) manageable(ctx context.Context, serverID, id, actorID string, denied error) (*Sticker, int, error) {
	stk, err := h.repo.FindByID(ctx, id)
	if errors.Is(err, ErrStickerNotFound) || (stk != nil && stk.ServerID != serverID) {
		return nil, http.StatusNotFound, ErrStickerNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao carregar figurinha.")
	}
	if stk.UploaderID == actorID {
		return stk, 0, nil
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, actorID)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao verificar permissões.")
	}
	if !permission.Has(perms, permission.ManageExpressions) {
		return nil, http.StatusForbidden, denied
	}
	return stk, 0, nil
}
