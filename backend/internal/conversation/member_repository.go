package conversation

import (
	"context"

	"gin-quickstart/backend/internal/namestyle"
)

// Participantes de uma conversa: quem é membro e os dados de cada um.

// membersJSONColumn: os participantes da conversa "c" em JSON (lista de
// OtherUser), na ordem de entrada.
var membersJSONColumn = `SELECT COALESCE(json_agg(json_build_object(
					'id', u.id,
					'username', u.username,
					'display_name', u.display_name,
					'avatar_url', u.avatar_url,
					'name_style', ` + namestyle.Expr("u") + `
				) ORDER BY cm2.joined_at, u.username), '[]')
				FROM conversation_members cm2
				JOIN users u ON u.id = cm2.user_id
				WHERE cm2.conversation_id = c.id`

func (r *Repository) IsMember(ctx context.Context, conversationID string, userID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(
		ctx,
		`SELECT EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)`,
		conversationID,
		userID,
	).Scan(&ok)
	return ok, err
}

func (r *Repository) ConversationParticipantIDs(ctx context.Context, conversationID string) ([]string, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1 ORDER BY joined_at, user_id`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) Members(ctx context.Context, conversationID string) ([]OtherUser, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT u.id, u.username, u.display_name, u.avatar_url, ` + namestyle.Expr("u") + `
		FROM conversation_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.conversation_id = $1
		ORDER BY cm.joined_at, u.username
		`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []OtherUser{}
	for rows.Next() {
		var m OtherUser
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.AvatarURL, &m.NameStyle); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

