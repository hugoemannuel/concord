// Package emoji cuida dos emojis personalizados de cada servidor e do pack base
// de emojis Unicode (docs/adr/0028-emojis-personalizados.md).
package emoji

import (
	"encoding/json"
	"errors"
	"regexp"
	"time"
)

const (
	// MaxEmojiBytes: limite por emoji (256 KB, como no Discord).
	MaxEmojiBytes int64 = 256 << 10

	// MaxEmojisPerServer: limite de emojis personalizados por servidor.
	MaxEmojisPerServer = 50
)

// nameRe: 2 a 32 letras sem acento, números ou "_" (vira o :nome: do emoji).
var nameRe = regexp.MustCompile(`^[A-Za-z0-9_]{2,32}$`)

var (
	ErrEmojiNotFound     = errors.New("emoji not found")
	ErrNotServerMember   = errors.New("you are not a member of this server")
	ErrCannotDeleteEmoji = errors.New("only the uploader, moderators or server owner can delete this emoji")
	ErrInvalidName       = errors.New("O nome precisa ter de 2 a 32 letras, números ou _.")
	ErrNameTaken         = errors.New("Já existe um emoji com esse nome neste servidor.")
	ErrServerFull        = errors.New("Este servidor já tem 50 emojis.")
	ErrCannotAddEmoji    = errors.New("Você não tem permissão para adicionar emojis neste servidor.")
	ErrTooLarge          = errors.New("Arquivo grande demais (máx. 256 KB).")
	ErrUnsupportedImage  = errors.New("Só imagens PNG, JPEG, WEBP, AVIF ou GIF.")
)

type Emoji struct {
	ID          string    `json:"id"`
	ServerID    string    `json:"server_id"`
	UploaderID  string    `json:"uploader_id"`
	Name        string    `json:"name"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
	// PublishedAt: já foi usado fora do servidor; o arquivo passa a ser
	// entregue a quem não é membro (ADR 0054).
	PublishedAt *time.Time `json:"-"`
}

// ServerEmojis: os emojis de um servidor, com o que o seletor mostra no
// cabeçalho da seção (nome e ícone do servidor).
type ServerEmojis struct {
	ServerID      string  `json:"server_id"`
	ServerName    string  `json:"server_name"`
	ServerIconURL *string `json:"server_icon_url,omitempty"`
	Emojis        []Emoji `json:"emojis"`
}

type CreatedEvent struct {
	ServerID string `json:"server_id"`
	Emoji    Emoji  `json:"emoji"`
}

type DeletedEvent struct {
	ServerID string `json:"server_id"`
	EmojiID  string `json:"emoji_id"`
}

func validName(name string) bool {
	return nameRe.MatchString(name)
}

func marshalEvent(typ string, payload any) []byte {
	data, err := json.Marshal(map[string]any{"type": typ, "payload": payload})
	if err != nil {
		return nil
	}
	return data
}
