package websocket

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/coder/websocket"
)

const (
	writeWait      = 10 * time.Second
	maxMessageSize = 65536
)

type subscribeValidator func(ctx context.Context, userID string, channelID string, conversationID string, serverID string, userRoomID string, callID string) bool

type CallRouter interface {
	HandleCallMessage(userID string, evType string, payload json.RawMessage)
	IsParticipant(callID string, userID string) bool
}

// TypingRouter trata "typing" e "typing:stop" (Typing).
type TypingRouter interface {
	Handle(ctx context.Context, userID string, evType string, payload json.RawMessage)
}

type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	userID     string
	send       chan []byte
	rooms      map[string]struct{}
	validator  subscribeValidator
	callRouter CallRouter
	typing     TypingRouter
	// Cancela a leitura (e com isso fecha a conexão); usado no desligamento.
	cancel context.CancelFunc
}

// inboundEvent é uma mensagem que o app manda pelo WebSocket.
type inboundEvent struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// callEvents são as mensagens repassadas ao serviço de chamadas.
var callEvents = map[string]bool{
	"call:invite": true, "call:accept": true, "call:decline": true, "call:leave": true,
	"call:screen": true, "call:voice": true, "call:soundboard": true,
	"call:activity": true, "call:activity:stop": true, "call:activity:join": true, "call:activity:leave": true,
	"call:lock": true, "call:knock": true, "call:knock_cancel": true, "call:knock_respond": true,
	"call:screen_watch": true,
	// Fala detectada no app (AFK em call, ver call/afk.go).
	"call:speaking": true,
	// Em que call o app está (null: nenhuma); ver call/media_presence.go.
	"call:presence":    true,
	"call:screen_draw": true, "call:screen_draw_clear": true, "call:screen_draw_undo": true,
}

func (c *Client) readPump(ctx context.Context) {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()

	c.conn.SetReadLimit(maxMessageSize)

	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		var ev inboundEvent
		if err := json.Unmarshal(data, &ev); err != nil {
			continue
		}
		c.dispatch(ctx, ev)
	}
}

// dispatch entrega a mensagem a quem cuida dela; tipo desconhecido é ignorado.
func (c *Client) dispatch(ctx context.Context, ev inboundEvent) {
	switch ev.Type {
	case "subscribe":
		c.subscribe(ctx, ev.Payload)
	case "unsubscribe":
		c.unsubscribe(ev.Payload)
	case "typing", "typing:stop":
		if c.typing != nil {
			c.typing.Handle(ctx, c.userID, ev.Type, ev.Payload)
		}
	case "ping":
		c.pong()
	case "activity:set", "activity:clear":
		c.hub.HandleActivity(c.userID, ev.Type, ev.Payload)
	default:
		if callEvents[ev.Type] && c.callRouter != nil {
			c.callRouter.HandleCallMessage(c.userID, ev.Type, ev.Payload)
		}
	}
}

type roomPayload struct {
	Room string `json:"room"`
}

// subscribe entra numa sala se ela existe e a pessoa pode vê-la.
func (c *Client) subscribe(ctx context.Context, payload json.RawMessage) {
	var p roomPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}
	channelID, conversationID, serverID, userRoomID, callID := parseRoom(p.Room)
	if channelID+conversationID+serverID+userRoomID+callID == "" {
		return
	}
	if c.validator != nil && !c.validator(ctx, c.userID, channelID, conversationID, serverID, userRoomID, callID) {
		return
	}
	c.hub.Subscribe(c, p.Room)
}

func (c *Client) unsubscribe(payload json.RawMessage) {
	var p roomPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}
	c.hub.Unsubscribe(c, p.Room)
}

func (c *Client) writePump(ctx context.Context) {
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
				log.Printf("ws write error (user %s): %v", c.userID, err)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func parseRoom(room string) (channelID string, conversationID string, serverID string, userRoomID string, callID string) {
	if strings.HasPrefix(room, "channel:") {
		return strings.TrimPrefix(room, "channel:"), "", "", "", ""
	}
	if strings.HasPrefix(room, "conversation:") {
		return "", strings.TrimPrefix(room, "conversation:"), "", "", ""
	}
	if strings.HasPrefix(room, "server:") {
		return "", "", strings.TrimPrefix(room, "server:"), "", ""
	}
	if strings.HasPrefix(room, "user:") {
		return "", "", "", strings.TrimPrefix(room, "user:"), ""
	}
	if strings.HasPrefix(room, "call:") {
		return "", "", "", "", strings.TrimPrefix(room, "call:")
	}
	return "", "", "", "", ""
}

func writeEvent(typ string, payload interface{}) []byte {
	data, err := json.Marshal(map[string]interface{}{
		"type":    typ,
		"payload": payload,
	})
	if err != nil {
		return nil
	}
	return data
}
