// Package serverprofile é a customização do servidor (#528, ADR 0050): o perfil
// que aparece no cartão (banner, traços, descrição, jogos), o perfil privado, a
// faixa e o fundo vistos por quem está no servidor e a tag que os membros usam
// ao lado do nome. O nome e o ícone continuam no domínio server.
package serverprofile

import (
	"errors"
	"time"
)

const (
	MaxTraits         = 5
	MaxTraitEmoji     = 8
	MaxTraitText      = 24
	MaxDescription    = 300
	MaxGames          = 8
	MaxGameName       = 64
	MaxTagName        = 4
	MaxLookupUsers    = 200
	MemberGamesShown  = 12
	DefaultThemeDim   = 50
	MaxPatchBodyBytes = 16 << 10
)

var (
	ErrInvalidProfile = errors.New("perfil do servidor inválido")
	ErrNoTag          = errors.New("esse servidor não tem tag")
	ErrNotMember      = errors.New("você não é membro desse servidor")
	ErrInvalidInvite  = errors.New("convite inválido ou expirado")
)

// Art é um fundo: um degradê da paleta ou uma imagem enviada (a imagem ganha).
type Art struct {
	Preset string `json:"preset"`
	Image  string `json:"image"`
}

// Trait é um traço do servidor: emoji e texto curto.
type Trait struct {
	Emoji string `json:"emoji"`
	Text  string `json:"text"`
}

// Game é um jogo em destaque; AppID e IconHash só nos da Steam (ícone).
type Game struct {
	Name     string `json:"name"`
	AppID    int64  `json:"app_id,omitempty"`
	IconHash string `json:"icon_hash,omitempty"`
}

// Theme é o fundo do servidor: um ponto de partida do app e/ou uma imagem.
type Theme struct {
	Starter string `json:"starter"`
	Image   string `json:"image"`
	Dim     int    `json:"dim"`
}

// Tag é a tag do servidor; Name vazio = o servidor não tem tag.
type Tag struct {
	ServerID string `json:"server_id"`
	Name     string `json:"name"`
	Badge    string `json:"badge"`
	Color    string `json:"color"`
}

// Profile é o que o servidor configura.
type Profile struct {
	Banner      Art     `json:"banner"`
	Traits      []Trait `json:"traits"`
	Description string  `json:"description"`
	Games       []Game  `json:"games"`
	Private     bool    `json:"private"`
	Strip       Art     `json:"strip"`
	Theme       Theme   `json:"theme"`
	Tag         *Tag    `json:"tag"`
}

// Patch: só o que veio muda (nil = fica como está), para duas pessoas ou duas
// seções editando juntas não desfazerem o trabalho uma da outra.
type Patch struct {
	Banner      *Art     `json:"banner"`
	Traits      *[]Trait `json:"traits"`
	Description *string  `json:"description"`
	Games       *[]Game  `json:"games"`
	Private     *bool    `json:"private"`
	Strip       *Art     `json:"strip"`
	Theme       *Theme   `json:"theme"`
	Tag         *TagEdit `json:"tag"`
}

// TagEdit é a edição da tag; Name vazio tira a tag do servidor.
type TagEdit struct {
	Name  string `json:"name"`
	Badge string `json:"badge"`
	Color string `json:"color"`
}

// Facts é o que o domínio server já sabe e o cartão mostra.
type Facts struct {
	Name      string
	IconURL   *string
	CreatedAt time.Time
	MemberIDs []string
}

// Card é o cartão do servidor. Locked: quem vê não tem acesso a um perfil
// privado e nada além do id que ele mesmo pediu sai daqui.
type Card struct {
	ServerID    string     `json:"server_id,omitempty"`
	Locked      bool       `json:"locked"`
	Name        string     `json:"name,omitempty"`
	IconURL     *string    `json:"icon_url,omitempty"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	MemberCount int        `json:"member_count"`
	OnlineCount int        `json:"online_count"`
	IsMember    bool       `json:"is_member"`
	Profile     *Profile   `json:"profile,omitempty"`
}

// TagOption é uma tag que a pessoa pode usar (de um servidor em que ela está).
type TagOption struct {
	Tag
	ServerName    string  `json:"server_name"`
	ServerIconURL *string `json:"server_icon_url,omitempty"`
}
