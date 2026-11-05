package emoji

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
)

// manageable: o emoji do servidor, se quem pede o enviou ou modera expressões.
func (h *Handler) manageable(ctx context.Context, serverID, emojiID, actorID string, denied error) (*Emoji, int, error) {
	e, err := h.repo.FindByID(ctx, emojiID)
	if errors.Is(err, ErrEmojiNotFound) || (err == nil && e.ServerID != serverID) {
		return nil, http.StatusNotFound, ErrEmojiNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao carregar emoji.")
	}
	if e.UploaderID == actorID {
		return e, 0, nil
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, actorID)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao verificar permissões.")
	}
	if !permission.Has(perms, permission.ManageExpressions) {
		return nil, http.StatusForbidden, denied
	}
	return e, 0, nil
}
