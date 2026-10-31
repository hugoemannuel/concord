package user

import (
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/profiletheme"
	"gin-quickstart/backend/internal/relationship"
)

type User struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	// Email nunca vai no JSON de User: User aparece para outras pessoas
	// (busca, amigos, eventos). A própria pessoa recebe Self().
	Email        string  `json:"-"`
	PasswordHash string  `json:"-"`
	AvatarURL    *string `json:"avatar_url,omitempty"`
	BannerURL    *string `json:"banner_url,omitempty"`
	BannerColor  *string `json:"banner_color,omitempty"`
	// EntranceSoundURL: som que toca para quem está na call quando a pessoa
	// entra (nil = o som padrão do app).
	EntranceSoundURL *string         `json:"entrance_sound_url,omitempty"`
	Pronouns         string          `json:"pronouns"`
	Bio              string          `json:"bio"`
	StatusText       string          `json:"status_text"`
	Links            []ProfileLink   `json:"links"`
	Status           string          `json:"status"`
	NameStyle        namestyle.Style `json:"name_style"`
	// ProfileTheme: borda, fundo e efeito do cartão de perfil.
	ProfileTheme profiletheme.Theme `json:"profile_theme"`
	// Look: a faixa efetiva e a moldura (o que os outros veem).
	cosmetics.Look
	// NameplateMode e NameplateCustomURL: a escolha da faixa e a imagem
	// própria guardada. Só a própria pessoa vê (vai no SelfUser).
	NameplateMode      string  `json:"-"`
	NameplateCustomURL *string `json:"-"`
	// Privacidade: só a própria pessoa vê (vai no SelfUser).
	FriendRequestPolicy string `json:"-"`
	AllowServerDMs      bool   `json:"-"`
	Active              bool   `json:"-"`
	// EmailVerifiedAt: nulo = e-mail não confirmado. Só a própria pessoa vê
	// (SelfUser.EmailVerified).
	EmailVerifiedAt *time.Time `json:"-"`
	// UsernameChangedAt: a última troca do @ (nula = nunca trocou; o cadastro
	// não conta). Limita a uma troca a cada UsernameCooldown.
	UsernameChangedAt *time.Time `json:"-"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// SelfUser é a conta vista pela própria pessoa (/users/me e /users/me/*):
// tudo de User mais o e-mail.
type SelfUser struct {
	User
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	// UsernameChangeAvailableAt: a partir de quando pode trocar o @ de novo
	// (ausente = nunca trocou). O app compara com a hora atual.
	UsernameChangeAvailableAt *time.Time `json:"username_change_available_at,omitempty"`
	NameplateMode             string     `json:"nameplate_mode"`
	NameplateCustomURL        *string    `json:"nameplate_custom_url,omitempty"`
}

// Privacy: quem pode mandar pedido de amizade e se membros de servidores em
// comum (que não são amigos) podem mandar DM.
type Privacy struct {
	FriendRequestPolicy string `json:"friend_request_policy"`
	AllowServerDMs      bool   `json:"allow_server_dms"`
}

const (
	FriendPolicyEveryone      = "everyone"
	FriendPolicyMutualFriends = "mutual_friends"
	FriendPolicyMutualServers = "mutual_servers"
	FriendPolicyNobody        = "nobody"
)

// ValidFriendPolicy diz se a política existe.
func ValidFriendPolicy(p string) bool {
	switch p {
	case FriendPolicyEveryone, FriendPolicyMutualFriends, FriendPolicyMutualServers, FriendPolicyNobody:
		return true
	}
	return false
}

// Privacy devolve as opções de privacidade da pessoa.
func (u *User) Privacy() Privacy {
	return Privacy{FriendRequestPolicy: u.FriendRequestPolicy, AllowServerDMs: u.AllowServerDMs}
}

// Self monta a resposta das rotas da própria conta, com o e-mail.
func (u *User) Self() SelfUser {
	return SelfUser{
		User:                      *u,
		Email:                     u.Email,
		EmailVerified:             u.EmailVerifiedAt != nil,
		UsernameChangeAvailableAt: usernameAvailableAt(u.UsernameChangedAt),
		NameplateMode:             u.NameplateMode,
		NameplateCustomURL:        u.NameplateCustomURL,
	}
}

// ProfileLink é um link do perfil (Steam, Twitch, site...). O app descobre o
// serviço pela URL.
type ProfileLink struct {
	URL string `json:"url"`
}

// PublicProfile é o que os outros veem no cartão de perfil: sem e-mail e com
// o status efetivo (invisível aparece como offline).
type PublicProfile struct {
	ID          string        `json:"id"`
	Username    string        `json:"username"`
	DisplayName string        `json:"display_name"`
	AvatarURL   *string       `json:"avatar_url,omitempty"`
	BannerURL   *string       `json:"banner_url,omitempty"`
	BannerColor *string       `json:"banner_color,omitempty"`
	Pronouns    string        `json:"pronouns"`
	Bio         string        `json:"bio"`
	StatusText  string        `json:"status_text"`
	Links       []ProfileLink `json:"links"`
	Status      string        `json:"status"`
	// IsBot: o Maestro. Aparece com o selo BOT e sempre online.
	IsBot     bool            `json:"is_bot"`
	NameStyle namestyle.Style `json:"name_style"`
	// Relationship: vínculo de quem pediu o cartão com a pessoa (sem vínculo,
	// Username vem vazio). Fica de fora no evento user:update.
	Relationship relationship.Kind  `json:"relationship,omitempty"`
	ProfileTheme profiletheme.Theme `json:"profile_theme"`
	cosmetics.Look
	CreatedAt time.Time `json:"created_at"`
}

// Public monta o perfil público com o status já calculado por quem chama.
func (u *User) Public(status string) PublicProfile {
	links := u.Links
	if links == nil {
		links = []ProfileLink{}
	}
	return PublicProfile{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		AvatarURL:    u.AvatarURL,
		BannerURL:    u.BannerURL,
		BannerColor:  u.BannerColor,
		Pronouns:     u.Pronouns,
		Bio:          u.Bio,
		StatusText:   u.StatusText,
		Links:        links,
		Status:       status,
		NameStyle:    u.NameStyle,
		ProfileTheme: u.ProfileTheme,
		Look:         u.Look,
		CreatedAt:    u.CreatedAt,
	}
}
