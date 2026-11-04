package websocket

import "gin-quickstart/backend/internal/channel"

func (h *Hub) PublishChannelCreate(event channel.CreateEvent) {
	h.BroadcastToServerChannel(event.ServerID, event.Channel.ID, writeEvent("channel:create", event))
}

func (h *Hub) PublishChannelUpdate(event channel.CreateEvent) {
	h.BroadcastToServerChannel(event.ServerID, event.Channel.ID, writeEvent("channel:update", event))
}

func (h *Hub) PublishChannelDelete(event channel.DeleteEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("channel:delete", event))
}

func (h *Hub) PublishChannelReorder(event channel.ReorderEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("channel:reorder", event))
}
