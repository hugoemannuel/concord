package server

import "context"

// SetNickname grava (ou tira, com nil) o apelido do membro no servidor.
func (r *Repository) SetNickname(ctx context.Context, serverID, userID string, nickname *string) (bool, error) {
	tag, err := r.db.Exec(
		ctx,
		`UPDATE server_members SET nickname = $3, updated_at = NOW() WHERE server_id = $1 AND user_id = $2`,
		serverID,
		userID,
		nickname,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// MemberNickname: o apelido do membro no servidor (nil = sem apelido).
func (r *Repository) MemberNickname(ctx context.Context, serverID, userID string) (*string, error) {
	var nick *string
	err := r.db.QueryRow(
		ctx,
		`SELECT nickname FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID,
		userID,
	).Scan(&nick)
	return nick, err
}
