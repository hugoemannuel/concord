// Package expression decide quem pode usar emojis e figurinhas de outros
// servidores e diz de onde eles vêm, sem vazar servidor privado
// (docs/adr/0054-emojis-de-outros-servidores.md).
package expression

import (
	"context"
	"errors"
)

var (
	// ErrForbidden: quem envia não é membro do servidor de origem ou não tem
	// "Usar emojis e figurinhas de outros servidores" no destino.
	ErrForbidden      = errors.New("Você não pode usar este emoji ou figurinha aqui.")
	ErrUnknownEmoji   = errors.New("emoji not found")
	ErrUnknownSticker = errors.New("sticker not found")
)

// Destination é para onde o item vai: um canal (e o servidor dele) ou, vazio,
// uma DM ou um grupo, que não têm servidor nem cargos.
type Destination struct {
	ServerID  string
	ChannelID string
}

// EmojiRef: o que a checagem precisa saber de um emoji.
type EmojiRef struct {
	Name     string
	ServerID string
}

// Store: as consultas e a marca de "já foi usado fora do servidor".
type Store interface {
	EmojisByID(ctx context.Context, ids []string) (map[string]EmojiRef, error)
	StickerServer(ctx context.Context, id string) (string, error)
	PublishEmojis(ctx context.Context, ids []string) error
	PublishSticker(ctx context.Context, id string) error
}

// Access: o que a checagem usa das permissões (permission.Service).
type Access interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
	ChannelPerms(ctx context.Context, channelID, userID string) (int64, error)
}
