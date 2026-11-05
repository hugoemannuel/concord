package websocket

// PublishCategoryChanged avisa sem revelar canais privados ou seus IDs.
func (h *Hub) PublishCategoryChanged(serverID string) {
	h.BroadcastToRoom("server:"+serverID, writeEvent("category:changed", map[string]string{"server_id": serverID}))
}
