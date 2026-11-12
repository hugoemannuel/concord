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

// ExpireViewOnce marca como apagadas as mídias de visualização única enviadas
// antes de sentBefore e devolve os ids, para o arquivo sair do disco.
func (r *Repository) ExpireViewOnce(ctx context.Context, sentBefore time.Time) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		UPDATE message_attachments SET view_once_gone_at = now()
		WHERE view_once AND view_once_gone_at IS NULL AND message_id IS NOT NULL AND created_at < $1
		RETURNING id::text`, sentBefore)
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
