package push

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository guarda os tokens FCM e responde as consultas de diretório do Notifier.
type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

// Upsert registra o token; se já existia para outra conta, ele passa para quem registrou agora.
func (r *Repository) Upsert(ctx context.Context, userID, token, platform string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
		 ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
		token, userID, platform)
	return err
}

func (r *Repository) DeleteForUser(ctx context.Context, userID, token string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, token, userID)
	return err
}

// Delete remove um token que o FCM disse não existir mais.
func (r *Repository) Delete(ctx context.Context, token string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM push_tokens WHERE token = $1`, token)
	return err
}

// TokensForUsers: os tokens de várias pessoas numa consulta (push de @all).
func (r *Repository) TokensForUsers(ctx context.Context, userIDs []string) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `SELECT user_id, token FROM push_tokens WHERE user_id = ANY($1)`, userIDs)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(userIDs))
	var userID, token string
	_, err = pgx.ForEachRow(rows, []any{&userID, &token}, func() error {
		out[userID] = append(out[userID], token)
		return nil
	})
	return out, err
}

func (r *Repository) TokensForUser(ctx context.Context, userID string) ([]string, error) {
	return r.strings(ctx, `SELECT token FROM push_tokens WHERE user_id = $1`, userID)
}

// HasToken diz se a pessoa tem algum aparelho com o app registrado para push.
func (r *Repository) HasToken(ctx context.Context, userID string) bool {
	var has bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM push_tokens WHERE user_id = $1)`, userID).Scan(&has)
	return err == nil && has
}

func (r *Repository) ChannelName(ctx context.Context, channelID string) (string, error) {
	var name string
	err := r.db.QueryRow(ctx, `SELECT name FROM channels WHERE id = $1`, channelID).Scan(&name)
	return name, err
}

func (r *Repository) ConversationName(ctx context.Context, conversationID string) (string, bool, error) {
	var name, kind string
	err := r.db.QueryRow(ctx, `SELECT name, type FROM conversations WHERE id = $1`, conversationID).Scan(&name, &kind)
	return name, kind == "group", err
}

func (r *Repository) ServerMemberIDs(ctx context.Context, serverID string) ([]string, error) {
	return r.strings(ctx, `SELECT user_id::text FROM server_members WHERE server_id = $1`, serverID)
}

func (r *Repository) MemberIDsByUsername(ctx context.Context, serverID string, usernames []string) ([]string, error) {
	return r.strings(ctx,
		`SELECT u.id::text FROM server_members m JOIN users u ON u.id = m.user_id
		 WHERE m.server_id = $1 AND lower(u.username) = ANY($2)`, serverID, usernames)
}

func (r *Repository) RoleMemberIDs(ctx context.Context, serverID string, roleIDs []string) ([]string, error) {
	return r.strings(ctx,
		`SELECT DISTINCT user_id::text FROM member_roles WHERE server_id = $1 AND role_id::text = ANY($2)`, serverID, roleIDs)
}

func (r *Repository) strings(ctx context.Context, sql string, args ...any) ([]string, error) {
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
