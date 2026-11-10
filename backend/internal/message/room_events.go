package message

import (
	"context"
	"log"
)

// RoomEvents publica o message:create de uma mensagem já gravada nas salas
// certas: o canal e o servidor dele, ou os participantes da DM (que reabre
// para quem a tinha fechado, como uma mensagem nova).
type RoomEvents struct {
	publisher EventPublisher
	channels  ChannelResolver
	convs     ConversationResolver
}

func NewRoomEvents(publisher EventPublisher, channels ChannelResolver, convs ConversationResolver) *RoomEvents {
	return &RoomEvents{publisher: publisher, channels: channels, convs: convs}
}

func (e *RoomEvents) Created(ctx context.Context, msg *Message) {
	if msg.ChannelID != nil {
		serverID, _ := e.channels.ChannelServerID(ctx, *msg.ChannelID)
		e.publisher.PublishMessageCreate(CreateEvent{ChannelID: msg.ChannelID, ServerID: serverID, Message: *msg})
		return
	}
	conversationID := *msg.ConversationID
	if err := e.convs.RevealConversation(ctx, conversationID); err != nil {
		log.Printf("[message] reveal conversation %s: %v", conversationID, err)
	}
	userIDs, _ := e.convs.ConversationParticipantIDs(ctx, conversationID)
	e.publisher.PublishMessageCreate(CreateEvent{ConversationID: msg.ConversationID, UserIDs: userIDs, Message: *msg})
}
