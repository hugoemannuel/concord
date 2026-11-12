package message

import (
	"context"
	"time"
)

// DeleteExpired apaga até limit mensagens com expires_at <= now e devolve o que
// foi apagado, com os ids dos anexos (que somem por cascata na mesma instrução).
func (r *Repository) DeleteExpired(ctx context.Context, now time.Time, limit int) ([]ExpiredMessage, error) {
	rows, err := r.db.Query(ctx, `
		WITH due AS (
			SELECT id, conversation_id FROM messages
			WHERE expires_at IS NOT NULL AND expires_at <= $1 AND conversation_id IS NOT NULL
			ORDER BY expires_at
			LIMIT $2
		), atts AS (
			SELECT a.message_id, array_agg(a.id::text) AS ids
			FROM message_attachments a JOIN due ON due.id = a.message_id
			GROUP BY a.message_id
		), gone AS (
			DELETE FROM messages m USING due WHERE m.id = due.id
			RETURNING m.id, due.conversation_id
		)
		SELECT gone.id::text, gone.conversation_id::text, COALESCE(atts.ids, '{}')
		FROM gone LEFT JOIN atts ON atts.message_id = gone.id`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpiredMessage
	for rows.Next() {
		var m ExpiredMessage
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.AttachmentIDs); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ExpiredViewOnce é um anexo de visualização única que acabou de ser marcado
// como apagado, com a mensagem a reavisar.
type ExpiredViewOnce struct {
	AttachmentID   string
	MessageID      string
	ConversationID string
}

// ExpireViewOnce marca como apagadas as mídias de visualização única que
// todos os destinatários já viram, ou que foram enviadas antes de sentBefore,
// e devolve os anexos, para reavisar a conversa (o arquivo sai do disco pela
// lista de pendentes). Nos dois casos, só se
// ninguém abriu desde viewedBefore: quem abriu tem o token por 5 min para
// carregar e avançar o vídeo.
func (r *Repository) ExpireViewOnce(ctx context.Context, sentBefore, viewedBefore time.Time) ([]ExpiredViewOnce, error) {
	rows, err := r.db.Query(ctx, `
		UPDATE message_attachments a SET view_once_gone_at = now()
		WHERE a.view_once AND a.view_once_gone_at IS NULL AND a.message_id IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM attachment_views v WHERE v.attachment_id = a.id AND v.viewed_at >= $2)
		  AND (a.created_at < $1 OR (
		        EXISTS (SELECT 1 FROM attachment_views v WHERE v.attachment_id = a.id)
		    AND NOT EXISTS (
		        SELECT 1 FROM view_once_recipients rc
		        WHERE rc.attachment_id = a.id
		          AND NOT EXISTS (SELECT 1 FROM attachment_views v WHERE v.attachment_id = a.id AND v.user_id = rc.user_id))))
		RETURNING a.id::text, a.message_id::text, a.conversation_id::text`, sentBefore, viewedBefore)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpiredViewOnce
	for rows.Next() {
		var e ExpiredViewOnce
		if err := rows.Scan(&e.AttachmentID, &e.MessageID, &e.ConversationID); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// PendingViewOnceFiles devolve até limit anexos marcados como apagados cujo
// arquivo ainda não foi removido do disco (inclui os de uma queda entre marcar
// e apagar).
func (r *Repository) PendingViewOnceFiles(ctx context.Context, limit int) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text FROM message_attachments
		WHERE view_once_gone_at IS NOT NULL AND NOT view_once_file_removed
		LIMIT $1`, limit)
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

// MarkViewOnceFilesRemoved registra que o arquivo desses anexos já saiu do disco.
func (r *Repository) MarkViewOnceFilesRemoved(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.db.Exec(ctx, `UPDATE message_attachments SET view_once_file_removed = true WHERE id::text = ANY($1)`, ids)
	return err
}
