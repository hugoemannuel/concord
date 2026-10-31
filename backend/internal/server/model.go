package server

import (
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
)

type Server struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	IconURL string `json:"icon_url"`
	OwnerID string `json:"owner_id"`
	// Canal de texto onde vão os avisos do servidor (aniversários…). Se o
	// escolhido não existe mais, é o primeiro canal de texto.
	PrimaryChannelID *string   `json:"primary_channel_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type ServerMember struct {
	ServerID    string  `json:"server_id"`
	UserID      string  `json:"user_id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	NameStyle   namestyle.Style `json:"name_style"`
	// Look: a faixa e a moldura (#482).
	cosmetics.Look
	// Nickname: apelido neste servidor (null = sem; vale o display_name).
	Nickname *string `json:"nickname"`
	IsBot    bool    `json:"is_bot"`
	// Role é legado (apps de antes dos cargos): "admin" se o membro pode
	// gerenciar canais. Os cargos de verdade estão em RoleIDs.
	Role      string    `json:"role"`
	RoleIDs   []string  `json:"role_ids"`
	JoinedAt  time.Time `json:"joined_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ServerInvite struct {
	ID              string     `json:"id"`
	ServerID        string     `json:"server_id"`
	ServerName      string     `json:"server_name,omitempty"`
	ServerIconURL   *string    `json:"server_icon_url,omitempty"`
	InviterID       string     `json:"inviter_id"`
	InviterUsername string     `json:"inviter_username,omitempty"`
	InviteeID       string     `json:"invitee_id"`
	InviteeUsername string     `json:"invitee_username,omitempty"`
	Status          string     `json:"status"`
	CreatedAt       time.Time  `json:"created_at"`
	RespondedAt     *time.Time `json:"responded_at,omitempty"`
}

type UpdateEvent struct {
	ServerID string `json:"server_id"`
	Server   Server `json:"server"`
}

type DeleteEvent struct {
	ServerID string `json:"server_id"`
}

type MemberJoinEvent struct {
	ServerID string       `json:"server_id"`
	Member   ServerMember `json:"member"`
}

type MemberLeaveEvent struct {
	ServerID string `json:"server_id"`
	UserID   string `json:"user_id"`
}

// MutualServer é um servidor em comum com outra pessoa (cartão de perfil).
type MutualServer struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	IconURL *string `json:"icon_url,omitempty"`
}
