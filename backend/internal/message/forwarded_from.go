package message

import (
	"encoding/json"
	"time"
)

// ForwardedFrom: de onde veio uma mensagem encaminhada (messages.forwarded_from).
// É a foto do momento do encaminhamento: nomes e data não acompanham mudanças
// depois. DM guarda só a conversa (sem nomes: quem vê o destino não precisa
// saber quem mais estava nela).
type ForwardedFrom struct {
	MessageID      string    `json:"message_id"`
	AuthorID       string    `json:"author_id"`
	AuthorName     string    `json:"author_name"`
	AuthorUsername string    `json:"author_username,omitempty"`
	ChannelID      *string   `json:"channel_id,omitempty"`
	ChannelName    string    `json:"channel_name,omitempty"`
	ServerID       *string   `json:"server_id,omitempty"`
	ServerName     string    `json:"server_name,omitempty"`
	ConversationID *string   `json:"conversation_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// forwardedFromBytes é o JSON da coluna (nil = coluna nula).
func forwardedFromBytes(ff *ForwardedFrom) []byte {
	if ff == nil {
		return nil
	}
	b, _ := json.Marshal(ff)
	return b
}

// parseForwardedFrom lê a coluna; vazio, ilegível ou sem a mensagem de
// origem = mensagem comum.
func parseForwardedFrom(raw []byte) *ForwardedFrom {
	if len(raw) == 0 {
		return nil
	}
	var ff ForwardedFrom
	if err := json.Unmarshal(raw, &ff); err != nil || ff.MessageID == "" {
		return nil
	}
	return &ff
}
