package websocket

import (
	"gin-quickstart/backend/internal/platform/wsevent"
	"gin-quickstart/backend/internal/user"
)

// Presença e status dos usuários conectados. Fica na memória do Hub, espelhado
// no banco pelo repository e avisado via websocket para todos os clientes.

// broadcastPresence avisa todo mundo do status efetivo. "online" continua no
// evento para quem só quer saber se está conectado.
func (h *Hub) broadcastPresence(userID, status string) {
	h.BroadcastAll(wsevent.Marshal("presence:update", map[string]interface{}{
		"user_id": userID,
		"online":  status != user.StatusOffline,
		"status":  status,
	}))
}

// effectiveStatusLocked: precisa de h.mu (leitura).
func (h *Hub) effectiveStatusLocked(userID string) string {
	connected := h.presence[userID] > 0
	status, ok := h.statuses[userID]
	if !ok {
		status = user.StatusOnline
	}
	return user.EffectiveStatus(status, connected)
}

// EffectiveStatus é o status que os outros veem (offline se desconectado ou
// invisível).
func (h *Hub) EffectiveStatus(userID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.effectiveStatusLocked(userID)
}

// SetUserStatus guarda o status escolhido e avisa a presença se mudou o que
// os outros veem.
func (h *Hub) SetUserStatus(userID, status string) {
	h.mu.Lock()
	before := h.effectiveStatusLocked(userID)
	wasInvisible := h.statuses[userID] == user.StatusInvisible
	h.statuses[userID] = status
	after := h.effectiveStatusLocked(userID)
	h.mu.Unlock()

	if before != after {
		h.broadcastPresence(userID, after)
	}
	h.republishOnVisibility(userID, wasInvisible, status == user.StatusInvisible)
}

func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.presence[userID] > 0
}

// IsConnected diz se a pessoa tem conexão WebSocket aberta, mesmo que esteja invisível.
func (h *Hub) IsConnected(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.presence[userID] > 0
}

// IsInvisible diz se a pessoa está conectada e escolheu ficar invisível.
func (h *Hub) IsInvisible(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.presence[userID] > 0 && h.statuses[userID] == user.StatusInvisible
}

// ChosenStatus devolve o status real que a pessoa escolheu (online, idle, dnd, invisible)
// ou "offline" se não tiver nenhuma conexão ativa.
func (h *Hub) ChosenStatus(userID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.presence[userID] <= 0 {
		return user.StatusOffline
	}
	if s, ok := h.statuses[userID]; ok {
		return s
	}
	return user.StatusOnline
}

// OnlineUserIDs lista quem tem pelo menos uma conexão aberta (badges).
func (h *Hub) OnlineUserIDs() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.presence))
	for id, n := range h.presence {
		if n > 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

// PresenceMap devolve o status efetivo de cada id ("offline" se desconectado
// ou invisível).
func (h *Hub) PresenceMap(userIDs []string) map[string]string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	result := make(map[string]string, len(userIDs))
	for _, id := range userIDs {
		if id == "" {
			continue
		}
		result[id] = h.effectiveStatusLocked(id)
	}
	return result
}
