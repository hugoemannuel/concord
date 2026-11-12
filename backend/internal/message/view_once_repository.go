package message

import "context"

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
