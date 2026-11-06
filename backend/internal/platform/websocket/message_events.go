package websocket

import "gin-quickstart/backend/internal/message"

// messageRooms são as salas por onde chegam message:create, message:update e
// message:delete:
// o canal e o servidor dele, ou a DM e a sala pessoal de cada participante.
func messageRooms(channelID *string, serverID string, conversationID *string, userIDs []string) []string {
	var rooms []string
	if channelID != nil {
		rooms = append(rooms, "channel:"+*channelID)
		if serverID != "" {
			rooms = append(rooms, "server:"+serverID)
		}
		return rooms
	}
	if conversationID != nil {
		rooms = append(rooms, "conversation:"+*conversationID)
		for _, userID := range userIDs {
			if userID != "" {
				rooms = append(rooms, "user:"+userID)
			}
		}
	}
	return rooms
}

// publishMessage entrega a mensagem nas salas do canal ou da DM. A sala do
// servidor (usada para não lidas) só recebe quem vê o canal: canal privado não
// vaza para o resto do servidor.
func (h *Hub) publishMessage(data []byte, channelID *string, serverID string, conversationID *string, userIDs []string) {
	for _, room := range messageRooms(channelID, "", conversationID, userIDs) {
		h.BroadcastToRoom(room, data)
	}
	if channelID != nil && serverID != "" {
		h.BroadcastToServerChannel(serverID, *channelID, data)
	}
}

func (h *Hub) PublishMessageCreate(event message.CreateEvent) {
	h.publishMessage(writeEvent("message:create", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

// PublishMessageUpdate (mensagem editada) vai pelas mesmas salas do create.
func (h *Hub) PublishMessageUpdate(event message.UpdateEvent) {
	h.publishMessage(writeEvent("message:update", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

func (h *Hub) PublishMessageDelete(event message.DeleteEvent) {
	h.publishMessage(writeEvent("message:delete", event), event.ChannelID, event.ServerID, event.ConversationID, event.UserIDs)
}

func (h *Hub) PublishMessagePin(event message.PinEvent) {
	h.publishMessage(writeEvent("channel:pin:add", event), &event.ChannelID, event.ServerID, nil, nil)
}

func (h *Hub) PublishMessageUnpin(event message.UnpinEvent) {
	h.publishMessage(writeEvent("channel:pin:remove", event), &event.ChannelID, event.ServerID, nil, nil)
}

// PublishPollUpdate vai só para a sala da conversa/canal: quem não está com a
// sala aberta recebe a enquete atualizada ao carregar as mensagens.
func (h *Hub) PublishPollUpdate(event message.PollUpdateEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, writeEvent("message:poll:update", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, writeEvent("message:poll:update", event))
	}
}

func (h *Hub) PublishReactionAdd(event message.ReactionEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, writeEvent("message:reaction:add", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, writeEvent("message:reaction:add", event))
	}
}

func (h *Hub) PublishReactionRemove(event message.ReactionEvent) {
	if event.ChannelID != nil {
		h.BroadcastToRoom("channel:"+*event.ChannelID, writeEvent("message:reaction:remove", event))
		return
	}
	if event.ConversationID != nil {
		h.BroadcastToRoom("conversation:"+*event.ConversationID, writeEvent("message:reaction:remove", event))
	}
}
