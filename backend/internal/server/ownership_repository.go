package server

import "context"

// TransferOwner troca o dono se fromID ainda é o dono e toID é membro (conta
// comum, não bot nem visitante). false = nada mudou.
func (r *Repository) TransferOwner(ctx context.Context, serverID, fromID, toID string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE servers SET owner_id = $3, updated_at = NOW()
		WHERE id = $1 AND owner_id = $2
		AND EXISTS (
			SELECT 1 FROM server_members m JOIN users u ON u.id = m.user_id
			WHERE m.server_id = $1 AND m.user_id = $3 AND NOT u.is_bot AND NOT u.is_guest AND u.active
		)`, serverID, fromID, toID)
	r.invalidatePerms(serverID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
