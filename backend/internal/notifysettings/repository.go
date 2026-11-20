package notifysettings

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NotifySettingsRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) All(ctx context.Context, userID string) (All, error) {
	out := All{Servers: map[string]Settings{}, Channels: map[string]Settings{}}

	rows, err := r.db.Query(ctx,
		`SELECT server_id, muted, muted_until, level, suppress_everyone, suppress_roles
		 FROM server_notification_settings WHERE user_id = $1`, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var s Settings
		if err := rows.Scan(&id, &s.Muted, &s.MutedUntil, &s.Level, &s.SuppressEveryone, &s.SuppressRoles); err != nil {
			return out, err
		}
		out.Servers[id] = s
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	crows, err := r.db.Query(ctx,
		`SELECT channel_id, muted, muted_until, level
		 FROM channel_notification_settings WHERE user_id = $1`, userID)
	if err != nil {
		return out, err
	}
	defer crows.Close()
	for crows.Next() {
		var id string
		var s Settings
		if err := crows.Scan(&id, &s.Muted, &s.MutedUntil, &s.Level); err != nil {
			return out, err
		}
		out.Channels[id] = s
	}
	return out, crows.Err()
}

func (r *Repository) SetServer(ctx context.Context, userID, serverID string, s Settings) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO server_notification_settings
			(user_id, server_id, muted, muted_until, level, suppress_everyone, suppress_roles, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		 ON CONFLICT (user_id, server_id) DO UPDATE SET
			muted = EXCLUDED.muted, muted_until = EXCLUDED.muted_until,
			level = EXCLUDED.level, suppress_everyone = EXCLUDED.suppress_everyone,
			suppress_roles = EXCLUDED.suppress_roles,
			updated_at = NOW()`,
		userID, serverID, s.Muted, s.MutedUntil, s.Level, s.SuppressEveryone, s.SuppressRoles)
	return err
}

func (r *Repository) DeleteServer(ctx context.Context, userID, serverID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM server_notification_settings WHERE user_id = $1 AND server_id = $2`,
		userID, serverID)
	return err
}

func (r *Repository) SetChannel(ctx context.Context, userID, channelID string, s Settings) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO channel_notification_settings
			(user_id, channel_id, muted, muted_until, level, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (user_id, channel_id) DO UPDATE SET
			muted = EXCLUDED.muted, muted_until = EXCLUDED.muted_until,
			level = EXCLUDED.level, updated_at = NOW()`,
		userID, channelID, s.Muted, s.MutedUntil, s.Level)
	return err
}

func (r *Repository) DeleteChannel(ctx context.Context, userID, channelID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM channel_notification_settings WHERE user_id = $1 AND channel_id = $2`,
		userID, channelID)
	return err
}
