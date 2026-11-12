package message

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// MarkViewOnce marca um anexo ainda pendente (sem mensagem) como de
// visualização única e grava quem poderá abri-lo. Só foto e vídeo, do próprio
// autor, na conversa do envio; senão ErrInvalidViewOnce. A marca vale enquanto
// o anexo está pendente: se o envio falhar, o Janitor o apaga.
func (r *Repository) MarkViewOnce(ctx context.Context, attachmentID, uploaderID, conversationID string, recipientIDs []string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE message_attachments SET view_once = true
		WHERE id = $1 AND uploader_id = $2 AND conversation_id = $3
		  AND message_id IS NULL AND kind IN ('image','video')`,
		attachmentID, uploaderID, conversationID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidViewOnce
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO view_once_recipients (attachment_id, user_id)
		SELECT $1, unnest($2::uuid[])
		ON CONFLICT DO NOTHING`, attachmentID, recipientIDs); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// viewOnceColumns: o estado da visualização única na mesma query dos anexos
// (quem já viu e quem podia ver só são lidos para esses anexos).
const viewOnceColumns = `
	a.view_once,
	a.view_once_gone_at IS NOT NULL,
	CASE WHEN a.view_once THEN COALESCE((SELECT array_agg(v.user_id::text ORDER BY v.viewed_at, v.user_id)
		FROM attachment_views v WHERE v.attachment_id = a.id), '{}') ELSE '{}' END,
	CASE WHEN a.view_once THEN COALESCE((SELECT array_agg(rc.user_id::text ORDER BY rc.user_id)
		FROM view_once_recipients rc WHERE rc.attachment_id = a.id), '{}') ELSE '{}' END
`

// scanAttachmentRow lê uma linha de AttachAttachments; vo só vem no anexo de
// visualização única.
func scanAttachmentRow(rows pgx.Rows) (string, Attachment, *ViewOnceMedia, error) {
	var messageID string
	var a Attachment
	var viewOnce bool
	v := &ViewOnceMedia{}
	if err := rows.Scan(
		&messageID, &a.ID, &a.Kind, &a.ContentType, &a.Filename, &a.SizeBytes, &a.Width, &a.Height, &a.DurationMs,
		&viewOnce, &v.Gone, &v.ViewerIDs, &v.RecipientIDs,
	); err != nil {
		return "", Attachment{}, nil, err
	}
	if !viewOnce {
		return messageID, a, nil, nil
	}
	v.ID, v.Kind = a.ID, a.Kind
	v.RecipientCount = len(v.RecipientIDs)
	return messageID, a, v, nil
}

// placeAttachment põe o anexo na mensagem: o de visualização única vai só em
// ViewOnce (sem URL, sem nome de arquivo), nunca em Attachments.
func placeAttachment(m *Message, a Attachment, vo *ViewOnceMedia) {
	if vo != nil {
		m.ViewOnce = vo
		return
	}
	m.Attachments = append(m.Attachments, a)
}

// IsViewOnceRecipient diz se userID estava entre quem podia abrir o anexo.
func (r *Repository) IsViewOnceRecipient(ctx context.Context, attachmentID, userID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM view_once_recipients WHERE attachment_id = $1 AND user_id = $2)`,
		attachmentID, userID).Scan(&ok)
	return ok, err
}

// GrantView grava a visualização de userID. Devolve false se ele já tinha
// visto (o conflito resolve duas aberturas ao mesmo tempo) ou se o anexo já
// foi apagado.
func (r *Repository) GrantView(ctx context.Context, attachmentID, userID string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		INSERT INTO attachment_views (attachment_id, user_id)
		SELECT id, $2 FROM message_attachments
		WHERE id = $1 AND view_once AND view_once_gone_at IS NULL
		ON CONFLICT DO NOTHING`, attachmentID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
