package websocket

import "gin-quickstart/backend/internal/platform/wsevent"

// PublishCategoryChanged avisa sem revelar canais privados ou seus IDs.
func (h *Hub) PublishCategoryChanged(serverID string) {
	h.BroadcastToRoom("server:"+serverID, wsevent.Marshal("category:changed", map[string]string{"server_id": serverID}))
}
