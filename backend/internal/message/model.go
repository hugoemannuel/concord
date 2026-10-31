package message

import (
	"time"

	"gin-quickstart/backend/internal/namestyle"
)

type Author struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	NameStyle   namestyle.Style `json:"name_style"`
	// AvatarDecorationURL: a moldura do avatar (#482).
	AvatarDecorationURL *string `json:"avatar_decoration_url,omitempty"`
}

type ReplyPreview struct {
	ID       string  `json:"id"`
	AuthorID string  `json:"author_id"`
	Author   *Author `json:"author,omitempty"`
	Content  string  `json:"content"`
}

type ReactionSummary struct {
	Emoji   string   `json:"emoji"`
	Count   int      `json:"count"`
	UserIDs []string `json:"user_ids"`
}

type ReactionRow struct {
	MessageID string
	UserID    string
	Emoji     string
}

type Message struct {
	ID             string            `json:"id"`
	AuthorID       string            `json:"author_id"`
	Author         *Author           `json:"author,omitempty"`
	ChannelID      *string           `json:"channel_id,omitempty"`
	ConversationID *string           `json:"conversation_id,omitempty"`
	ReplyToID      *string           `json:"reply_to_id,omitempty"`
	ReplyTo        *ReplyPreview     `json:"reply_to,omitempty"`
	Reactions      []ReactionSummary `json:"reactions,omitempty"`
	Content        string            `json:"content"`
	// Mensagem do próprio servidor (ex.: "birthday"); nil = mensagem comum.
	SystemKind *string `json:"system_kind,omitempty"`
	// "all"/"here" quando a mensagem pinga o canal (só dono/moderador, com
	// anti-spam); nil = não pinga ninguém, mesmo com "@all" no texto.
	MentionEveryone *string      `json:"mention_everyone"`
	Poll            *Poll        `json:"poll,omitempty"`
	Attachments     []Attachment    `json:"attachments,omitempty"`
	StickerID       *string         `json:"sticker_id,omitempty"`
	Sticker         *StickerPreview `json:"sticker,omitempty"`
	GifURL          *string         `json:"gif_url,omitempty"`
	GifMetadata     *GifMetadata    `json:"gif_metadata,omitempty"`
	// Convite para a call de um canal de voz (cartão na DM); nil = mensagem comum.
	CallInvite *CallInvite `json:"call_invite,omitempty"`
	// Mensagem /tts: o app de quem está em call lê o texto em voz (tts.go).
	TTS             bool         `json:"tts,omitempty"`
	// Canal de voz cuja call ouve a TTS (tts.go); nil em DM e em TTS antiga:
	// ninguém ouve em canal sem ele.
	TTSVoiceChannelID *string `json:"tts_voice_channel_id,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	// Quando o autor editou o texto pela última vez; nil = nunca editada.
	EditedAt *time.Time `json:"edited_at,omitempty"`
	// Quando a mensagem foi fixada no canal; nil = não fixada.
	PinnedAt *time.Time `json:"pinned_at,omitempty"`
}

type PinnedMessage struct {
	Message
	PinnedBy   *Author   `json:"pinned_by,omitempty"`
	PinnedByID *string   `json:"pinned_by_id,omitempty"`
	PinnedAt   time.Time `json:"pinned_at"`
}

type CreateEvent struct {
	ChannelID      *string  `json:"channel_id,omitempty"`
	ConversationID *string  `json:"conversation_id,omitempty"`
	ServerID       string   `json:"server_id,omitempty"`
	UserIDs        []string `json:"user_ids,omitempty"`
	Message        Message  `json:"message"`
}

// UpdateEvent é o message:update (mensagem editada). Vai para as mesmas salas
// do message:create.
type UpdateEvent struct {
	ChannelID      *string  `json:"channel_id,omitempty"`
	ConversationID *string  `json:"conversation_id,omitempty"`
	ServerID       string   `json:"server_id,omitempty"`
	UserIDs        []string `json:"user_ids,omitempty"`
	Message        Message  `json:"message"`
}

type DeleteEvent struct {
	ChannelID      *string  `json:"channel_id,omitempty"`
	ConversationID *string  `json:"conversation_id,omitempty"`
	ServerID       string   `json:"server_id,omitempty"`
	UserIDs        []string `json:"user_ids,omitempty"`
	MessageID      string   `json:"message_id"`
}

type ReactionEvent struct {
	ChannelID      *string `json:"channel_id,omitempty"`
	ConversationID *string `json:"conversation_id,omitempty"`
	MessageID      string  `json:"message_id"`
	UserID         string  `json:"user_id"`
	Emoji          string  `json:"emoji"`
}

type PinEvent struct {
	ChannelID string        `json:"channel_id"`
	ServerID  string        `json:"server_id,omitempty"`
	Message   PinnedMessage `json:"message"`
}

type StickerPreview struct {
	ID          string `json:"id"`
	ServerID    string `json:"server_id"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
}

type GifMetadata struct {
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	PreviewURL string `json:"preview_url,omitempty"`
}

type UnpinEvent struct {
	ChannelID string `json:"channel_id"`
	ServerID  string `json:"server_id,omitempty"`
	MessageID string `json:"message_id"`
}
