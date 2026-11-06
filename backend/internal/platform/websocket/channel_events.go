package websocket

import (
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/wsevent"
)

func (h *Hub) PublishChannelCreate(event channel.CreateEvent) {
	h.BroadcastToServerChannel(event.ServerID, event.Channel.ID, wsevent.Marshal("channel:create", event))
}

func (h *Hub) PublishChannelUpdate(event channel.CreateEvent) {
	h.BroadcastToServerChannel(event.ServerID, event.Channel.ID, wsevent.Marshal("channel:update", event))
}

func (h *Hub) PublishChannelDelete(event channel.DeleteEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, wsevent.Marshal("channel:delete", event))
}

// PublishChannelReorder manda a cada um só os ids que ele vê: a ordem dos canais não
// pode entregar quais canais privados existem.
func (h *Hub) PublishChannelReorder(event channel.ReorderEvent) {
	snap := h.snapshot(event.ServerID)
	if snap == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	payloads := map[string][]byte{}
	for client := range h.rooms["server:"+event.ServerID] {
		payload, ready := payloads[client.userID]
		if !ready {
			payload = wsevent.Marshal("channel:reorder", reorderSeenBy(event, snap, client.userID))
			payloads[client.userID] = payload
		}
		select {
		case client.send <- payload:
		default:
			// cliente lento: perde este aviso, como nos outros eventos
		}
	}
}

func reorderSeenBy(event channel.ReorderEvent, snap *permission.Snapshot, userID string) channel.ReorderEvent {
	visible := make([]string, 0, len(event.ChannelIDs))
	for _, id := range event.ChannelIDs {
		if snap.CanView(id, userID) {
			visible = append(visible, id)
		}
	}
	event.ChannelIDs = visible
	return event
}
