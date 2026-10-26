package friendship

import (
	"time"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/user"
)

type Friendship struct {
	RequesterID string    `json:"requester_id"`
	AddresseeID string    `json:"addressee_id"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PendingRequest struct {
	UserID      string          `json:"user_id"`
	Username    string          `json:"username"`
	DisplayName string          `json:"display_name"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	NameStyle   namestyle.Style `json:"name_style"`
	Direction   string          `json:"direction"`
	CreatedAt   time.Time       `json:"created_at"`
}

// Relação vista por quem pergunta. Quem foi bloqueado não fica sabendo:
// para ele a relação é "none".
const (
	RelationNone     = "none"
	RelationFriend   = "friend"
	RelationIncoming = "incoming"
	RelationOutgoing = "outgoing"
	RelationBlocked  = "blocked"
)

// Relationship alimenta o cartão de perfil: a relação, os amigos em comum e
// os servidores em comum.
type Relationship struct {
	Type          string      `json:"type"`
	MutualFriends []user.User `json:"mutual_friends"`
	MutualServers any         `json:"mutual_servers"`
}

// Resultado de SendRequest: pedido enviado ou, se a outra pessoa já tinha
// pedido, amizade aceita na hora (como no Discord).
const (
	RequestSent     = "sent"
	RequestAccepted = "accepted"
)
