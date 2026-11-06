package websocket

import (
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/wsevent"
)

// publishMessage entrega a mensagem do canal ou da DM.
func (h *Hub) publishMessage(data []byte, channelID *string, serverID string, conversationID *string, userIDs []string) {
	if channelID != nil {
		h.publishToChannel(serverID, *channelID, data)
		return
	}
	if conversationID != nil {
		h.BroadcastToRoomsExcept(conversationRooms(*conversationID, userIDs), "", data)
	}
}

// conversationRooms são a sala da DM e a sala pessoal de cada participante
// (quem está com a DM fechada também recebe).
func conversationRooms(conversationID string, userIDs []string) []string {
	rooms := []string{"conversation:" + conversationID}
	for _, userID := range userIDs {
		if userID != "" {
			rooms = append(rooms, "user:"+userID)
		}
	}
	return rooms
}

// publishToChannel entrega uma vez por conexão: primeiro a quem está com o canal
// aberto, depois à sala do servidor (usada para não lidas e menções) pulando
// quem já recebeu e quem não vê o canal (canal privado não vaza). Sem
// permissões do servidor, a sala do servidor não recebe nada.
func (h *Hub) publishToChannel(serverID, channelID string, data []byte) {
	var snap *permission.Snapshot
	if serverID != "" {
		snap = h.snapshot(serverID)
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	opened := h.rooms["channel:"+channelID]
	for client := range opened {
		client.trySend(data)
	}
	if snap == nil {
		return
	}
	for client := range h.rooms["server:"+serverID] {
		if _, sent := opened[client]; sent || !snap.CanView(channelID, client.userID) {
			continue
		}
		client.trySend(data)
	}
}

func (h *Hub) PublishMessageCreate(event message.CreateEvent) {
	h.publishMessage(wsevent.Marshal("message:create", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

// PublishMessageUpdate (mensagem editada) vai pelas mesmas salas do create.
func (h *Hub) PublishMessageUpdate(event message.UpdateEvent) {
	h.publishMessage(wsevent.Marshal("message:update", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

func (h *Hub) PublishMessageDelete(event message.DeleteEvent) {
	h.publishMessage(wsevent.Marshal("message:delete", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

func (h *Hub) PublishMessagePin(event message.PinEvent) {
	h.publishMessage(wsevent.Marshal("channel:pin:add", event), &event.ChannelID, event.ServerID, nil, nil)
}

func (h *Hub) PublishMessageUnpin(event message.UnpinEvent) {
	h.publishMessage(wsevent.Marshal("channel:pin:remove", event), &event.ChannelID, event.ServerID, nil, nil)
}

// PublishPollUpdate vai só para a sala da conversa/canal: quem não está com a
// sala aberta recebe a enquete atualizada ao carregar as mensagens.
func (h *Hub) PublishPollUpdate(event message.PollUpdateEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, wsevent.Marshal("message:poll:update", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, wsevent.Marshal("message:poll:update", event))
	}
}

func (h *Hub) PublishReactionAdd(event message.ReactionEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, wsevent.Marshal("message:reaction:add", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, wsevent.Marshal("message:reaction:add", event))
	}
}

func (h *Hub) PublishReactionRemove(event message.ReactionEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, wsevent.Marshal("message:reaction:remove", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, wsevent.Marshal("message:reaction:remove", event))
	}
}
