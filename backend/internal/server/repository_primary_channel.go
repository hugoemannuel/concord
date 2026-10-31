package server

import "context"

// O canal principal do servidor. Extraído do repository.go sem mudar o comportamento.

// SetPrimaryChannel escolhe o canal principal; o canal tem que ser de texto e
// deste servidor.
func (r *Repository) SetPrimaryChannel(ctx context.Context, serverID string, channelID string) error {
	tag, err := r.db.Exec(
		ctx,
		`
		UPDATE servers
		SET primary_channel_id = $2, updated_at = NOW()
		WHERE id = $1
		AND EXISTS (
			SELECT 1 FROM channels WHERE id = $2 AND server_id = $1 AND type = 'text' AND NOT managed
		)
		`,
		serverID,
		channelID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidPrimaryChannel
	}
	return nil
}
