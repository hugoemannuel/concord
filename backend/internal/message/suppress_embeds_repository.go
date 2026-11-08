package message

import "context"

// SuppressEmbeds marca embeds_suppressed numa mensagem do autor. Mensagem de
// outro autor (ou que sumiu) não muda e dá ErrMessageNotFound.
func (r *Repository) SuppressEmbeds(ctx context.Context, id, authorID string) error {
	tag, err := r.db.Exec(ctx, `UPDATE messages SET embeds_suppressed = true WHERE id = $1 AND author_id = $2`, id, authorID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMessageNotFound
	}
	return nil
}
