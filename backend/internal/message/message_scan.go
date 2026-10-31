package message

import (
	"encoding/json"

	"gin-quickstart/backend/internal/namestyle"
)

// Leitura das linhas de messages (colunas de messageColumns) para Message.

type scannable interface {
	Scan(dest ...any) error
}

type rowScanner interface {
	Next() bool
	Scan(dest ...any) error
}

func populateMedia(msg *Message, stickerServerID, stickerName, stickerContentType *string, rawGifMeta []byte) {
	if msg.StickerID != nil && stickerName != nil && stickerServerID != nil && stickerContentType != nil {
		msg.Sticker = &StickerPreview{
			ID:          *msg.StickerID,
			ServerID:    *stickerServerID,
			Name:        *stickerName,
			ContentType: *stickerContentType,
		}
	}
	if len(rawGifMeta) > 0 {
		var gm GifMetadata
		if err := json.Unmarshal(rawGifMeta, &gm); err == nil {
			msg.GifMetadata = &gm
		}
	}
}

func scanMessages(rows rowScanner) ([]Message, error) {
	var messages []Message
	for rows.Next() {
		msg, err := scanMessageRow(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []Message{}
	}

	return messages, nil
}

// scanMessageRow lê uma linha de messageColumns; extra recebe as colunas
// que vierem depois delas.
func scanMessageRow(row scannable, extra ...any) (Message, error) {
	var msg Message
	var replyID, replyAuthorID, replyUsername, replyDisplayName, replyContent *string
	var replyAvatarURL, replyDecorationURL *string
	var replyStyle namestyle.Style
	var stickerServerID, stickerName, stickerContentType *string
	var rawGifMeta, rawCallInvite []byte

	msg.Author = &Author{}
	dest := []any{
		&msg.ID,
		&msg.AuthorID,
		&msg.Author.Username,
		&msg.Author.DisplayName,
		&msg.Author.AvatarURL,
		&msg.Author.NameStyle,
		&msg.Author.AvatarDecorationURL,
		&msg.ChannelID,
		&msg.ConversationID,
		&msg.ReplyToID,
		&msg.Content,
		&msg.SystemKind,
		&msg.MentionEveryone,
		&msg.CreatedAt,
		&msg.EditedAt,
		&replyID,
		&replyAuthorID,
		&replyUsername,
		&replyDisplayName,
		&replyAvatarURL,
		&replyStyle,
		&replyDecorationURL,
		&replyContent,
		&msg.StickerID,
		&stickerServerID,
		&stickerName,
		&stickerContentType,
		&msg.GifURL,
		&rawGifMeta,
		&msg.TTS,
		&msg.TTSVoiceChannelID,
		&rawCallInvite,
	}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return Message{}, err
	}
	msg.Author.ID = msg.AuthorID

	if replyID != nil && replyAuthorID != nil && replyUsername != nil && replyDisplayName != nil && replyContent != nil {
		msg.ReplyTo = &ReplyPreview{
			ID:       *replyID,
			AuthorID: *replyAuthorID,
			Author: &Author{
				ID:          *replyAuthorID,
				Username:    *replyUsername,
				DisplayName: *replyDisplayName,
				AvatarURL:   replyAvatarURL,
				NameStyle:   replyStyle,

				AvatarDecorationURL: replyDecorationURL,
			},
			Content: *replyContent,
		}
	}

	populateMedia(&msg, stickerServerID, stickerName, stickerContentType, rawGifMeta)
	msg.CallInvite = parseCallInvite(rawCallInvite)
	return msg, nil
}
