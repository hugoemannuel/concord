package message

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const attachmentColumns = `
	id,
	kind,
	content_type,
	filename,
	size_bytes,
	width,
	height,
	duration_ms
`

// CreatePendingAttachment grava o anexo recém-enviado, ainda sem mensagem.
func (r *Repository) CreatePendingAttachment(ctx context.Context, a *storedAttachment) error {
	return r.db.QueryRow(
		ctx,
		`
		INSERT INTO message_attachments
			(id, uploader_id, channel_id, conversation_id, kind, content_type, filename, size_bytes, width, height, duration_ms)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING created_at
		`,
		a.ID,
		a.UploaderID,
		a.ChannelID,
		a.ConversationID,
		a.Kind,
		a.ContentType,
		a.Filename,
		a.SizeBytes,
		a.Width,
		a.Height,
		a.DurationMs,
	).Scan(&a.CreatedAt)
}

func (r *Repository) FindAttachment(ctx context.Context, id string) (*storedAttachment, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrAttachmentNotFound
	}
	a := &storedAttachment{}
	err := r.db.QueryRow(
		ctx,
		`
		SELECT `+attachmentColumns+`,
			uploader_id,
			message_id,
			channel_id,
			conversation_id,
			created_at,
			view_once,
			view_once_gone_at IS NOT NULL
		FROM message_attachments
		WHERE id = $1
		  AND NOT (view_once AND EXISTS (
			SELECT 1 FROM messages m
			WHERE m.id = message_attachments.message_id AND m.expires_at <= now()))
		`,
		id,
	).Scan(
		&a.ID,
		&a.Kind,
		&a.ContentType,
		&a.Filename,
		&a.SizeBytes,
		&a.Width,
		&a.Height,
		&a.DurationMs,
		&a.UploaderID,
		&a.MessageID,
		&a.ChannelID,
		&a.ConversationID,
		&a.CreatedAt,
		&a.ViewOnce,
		&a.ViewOnceGone,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAttachmentNotFound
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}

// CreateWithAttachments grava a mensagem e liga a ela os anexos pendentes numa
// transação só. Cada anexo precisa ser do autor, da mesma sala e ainda não ter
// mensagem; se algum não servir, nada é gravado (ErrInvalidAttachment).
func (r *Repository) CreateWithAttachments(ctx context.Context, msg *Message, attachmentIDs []string) error {
	for _, id := range attachmentIDs {
		if _, err := uuid.Parse(id); err != nil {
			return ErrInvalidAttachment
		}
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var gifMetaBytes []byte
	if msg.GifMetadata != nil {
		gifMetaBytes, _ = json.Marshal(msg.GifMetadata)
	}

	if _, err := tx.Exec(
		ctx,
		insertMessageSQL,
		msg.ID,
		msg.AuthorID,
		msg.ChannelID,
		msg.ConversationID,
		msg.ReplyToID,
		msg.Content,
		nil, // system_kind: mensagem com anexo nunca é aviso de sistema
		msg.MentionEveryone,
		msg.StickerID,
		msg.GifURL,
		gifMetaBytes,
		nil,   // call_invite
		false, // tts
		nil,   // tts_voice_channel_id
	); err != nil {
		return err
	}

	tag, err := tx.Exec(
		ctx,
		`
		UPDATE message_attachments
		SET message_id = $1, position = array_position($2::uuid[], id) - 1
		WHERE id = ANY($2::uuid[])
		AND uploader_id = $3
		AND message_id IS NULL
		AND channel_id IS NOT DISTINCT FROM $4::uuid
		AND conversation_id IS NOT DISTINCT FROM $5::uuid
		`,
		msg.ID,
		attachmentIDs,
		msg.AuthorID,
		msg.ChannelID,
		msg.ConversationID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != int64(len(attachmentIDs)) {
		return ErrInvalidAttachment
	}

	return tx.Commit(ctx)
}

// AttachAttachments preenche Attachments nas mensagens (uma query por página).
// O anexo de visualização única nunca vai em Attachments: vai em ViewOnce, sem
// URL (placeAttachment).
func (r *Repository) AttachAttachments(ctx context.Context, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]string, len(messages))
	index := make(map[string]int, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
		index[m.ID] = i
	}

	rows, err := r.db.Query(
		ctx,
		`
		SELECT a.message_id, `+attachmentColumns+`, `+viewOnceColumns+`
		FROM message_attachments a
		WHERE a.message_id = ANY($1::uuid[])
		ORDER BY a.message_id, a.position
		`,
		ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		messageID, a, vo, err := scanAttachmentRow(rows)
		if err != nil {
			return err
		}
		if i, ok := index[messageID]; ok {
			placeAttachment(&messages[i], a, vo)
		}
	}
	return rows.Err()
}

// MessageAttachmentIDs lista os anexos de uma mensagem (para apagar os arquivos).
func (r *Repository) MessageAttachmentIDs(ctx context.Context, messageID string) ([]string, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT id FROM message_attachments WHERE message_id = $1`,
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// KnownAttachmentIDs diz quais desses ids ainda têm linha no banco.
func (r *Repository) KnownAttachmentIDs(ctx context.Context, ids []string) (map[string]bool, error) {
	known := make(map[string]bool, len(ids))
	const batch = 1000
	for start := 0; start < len(ids); start += batch {
		chunk := ids[start:min(start+batch, len(ids))]
		rows, err := r.db.Query(
			ctx,
			`SELECT id FROM message_attachments WHERE id = ANY($1::uuid[])`,
			chunk,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			known[id] = true
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return known, nil
}

// DeleteStalePending apaga os uploads que nunca viraram mensagem até before e
// devolve os ids (para apagar os arquivos).
func (r *Repository) DeleteStalePending(ctx context.Context, before time.Time) ([]string, error) {
	rows, err := r.db.Query(
		ctx,
		`DELETE FROM message_attachments WHERE message_id IS NULL AND created_at < $1 RETURNING id`,
		before,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CountAttachments conta todas as linhas de anexo (a limpeza usa para não
// varrer o disco contra um banco vazio).
func (r *Repository) CountAttachments(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM message_attachments`).Scan(&n)
	return n, err
}
