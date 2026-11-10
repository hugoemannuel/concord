package message

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

// CreateForwarded grava a mensagem encaminhada e as cópias dos anexos (já
// ligadas a ela, na sala de destino) numa transação só.
func (r *Repository) CreateForwarded(ctx context.Context, msg *Message, attachments []storedAttachment) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := insertForwarded(ctx, tx, msg); err != nil {
			return err
		}
		return insertAttachmentCopies(ctx, tx, msg.ID, attachments)
	})
}

func insertForwarded(ctx context.Context, tx pgx.Tx, msg *Message) error {
	var gifMeta []byte
	if msg.GifMetadata != nil {
		gifMeta, _ = json.Marshal(msg.GifMetadata)
	}
	_, err := tx.Exec(
		ctx,
		`
		INSERT INTO messages (id, author_id, channel_id, conversation_id, content, sticker_id, deleted_sticker_name, gif_url, gif_metadata, embeds_suppressed, forwarded_from)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		`,
		msg.ID, msg.AuthorID, msg.ChannelID, msg.ConversationID, msg.Content, msg.StickerID,
		msg.DeletedStickerName, msg.GifURL, gifMeta, msg.EmbedsSuppressed, forwardedFromBytes(msg.ForwardedFrom),
	)
	return err
}

func insertAttachmentCopies(ctx context.Context, tx pgx.Tx, messageID string, attachments []storedAttachment) error {
	for i, a := range attachments {
		if _, err := tx.Exec(
			ctx,
			`
			INSERT INTO message_attachments
				(id, message_id, position, uploader_id, channel_id, conversation_id, kind, content_type, filename, size_bytes, width, height, duration_ms)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			`,
			a.ID, messageID, i, a.UploaderID, a.ChannelID, a.ConversationID, a.Kind, a.ContentType,
			a.Filename, a.SizeBytes, a.Width, a.Height, a.DurationMs,
		); err != nil {
			return err
		}
	}
	return nil
}
