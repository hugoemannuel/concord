package conversation

import (
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
)

const (
	TypeDM    = "dm"
	TypeGroup = "group"

	// MaxGroupMembers é o limite da DM em grupo (como no Discord), contando
	// quem criou.
	MaxGroupMembers = 10
	MaxGroupName    = 100
)

// Conversation é uma DM 1:1 (UserAID < UserBID) ou um grupo (participantes
// em conversation_members, com nome/ícone e dono).
type Conversation struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	IconURL   *string   `json:"icon_url,omitempty"`
	OwnerID   *string   `json:"owner_id,omitempty"`
	UserAID   string    `json:"user_a_id,omitempty"`
	UserBID   string    `json:"user_b_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (c *Conversation) IsGroup() bool { return c.Type == TypeGroup }

type OtherUser struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	NameStyle   namestyle.Style `json:"name_style"`
	cosmetics.Look
}

type LastMessage struct {
	ID        string    `json:"id"`
	AuthorID  string    `json:"author_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// Summary é uma linha da lista de DMs. OtherUser só na DM 1:1; Members tem
// todos os participantes (inclusive quem pediu).
type Summary struct {
	Conversation
	OtherUser   *OtherUser   `json:"other_user,omitempty"`
	Members     []OtherUser  `json:"members"`
	LastMessage *LastMessage `json:"last_message,omitempty"`
	UnreadCount int          `json:"unread_count"`
}

// Detail é uma conversa com os participantes (tela do grupo).
type Detail struct {
	Conversation
	Members []OtherUser `json:"members"`
}

func (s *Summary) GetOtherUserID(userID string) string {
	if s.UserAID == userID {
		return s.UserBID
	}
	return s.UserAID
}
