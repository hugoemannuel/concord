package soundboard

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
)

// manageable: o item do servidor, se quem pede o enviou ou modera expressões.
func (h *Handler) manageable(ctx context.Context, serverID, id, actorID string, denied error) (*Sound, int, error) {
	sound, err := h.repo.FindByID(ctx, id)
	if errors.Is(err, ErrSoundNotFound) || (sound != nil && sound.ServerID != serverID) {
		return nil, http.StatusNotFound, ErrSoundNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao carregar som.")
	}
	if sound.UploaderID == actorID {
		return sound, 0, nil
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, actorID)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Falha ao verificar permissões.")
	}
	if !permission.Has(perms, permission.ManageExpressions) {
		return nil, http.StatusForbidden, denied
	}
	return sound, 0, nil
}
