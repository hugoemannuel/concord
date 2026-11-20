package notifysettings

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// AllFor: All de várias pessoas em duas consultas (servidores e canais), em
// vez de duas por pessoa. Quem não tem preferência gravada vem com os mapas
// vazios (o padrão).
func (r *Repository) AllFor(ctx context.Context, userIDs []string) (map[string]All, error) {
	out := defaultsFor(userIDs)
	if err := r.serverSettingsFor(ctx, userIDs, out); err != nil {
		return nil, err
	}
	return out, r.channelSettingsFor(ctx, userIDs, out)
}

// defaultsFor: o padrão (nada gravado) de cada pessoa.
func defaultsFor(userIDs []string) map[string]All {
	out := make(map[string]All, len(userIDs))
	for _, id := range userIDs {
		out[id] = All{Servers: map[string]Settings{}, Channels: map[string]Settings{}}
	}
	return out
}

func (r *Repository) serverSettingsFor(ctx context.Context, userIDs []string, out map[string]All) error {
	rows, err := r.db.Query(ctx,
		`SELECT user_id, server_id, muted, muted_until, level, suppress_everyone, suppress_roles
		 FROM server_notification_settings WHERE user_id = ANY($1)`, userIDs)
	if err != nil {
		return err
	}
	var userID, id string
	var s Settings
	_, err = pgx.ForEachRow(rows, []any{&userID, &id, &s.Muted, &s.MutedUntil, &s.Level, &s.SuppressEveryone, &s.SuppressRoles}, func() error {
		out[userID].Servers[id] = s
		return nil
	})
	return err
}

func (r *Repository) channelSettingsFor(ctx context.Context, userIDs []string, out map[string]All) error {
	rows, err := r.db.Query(ctx,
		`SELECT user_id, channel_id, muted, muted_until, level
		 FROM channel_notification_settings WHERE user_id = ANY($1)`, userIDs)
	if err != nil {
		return err
	}
	var userID, id string
	var s Settings
	_, err = pgx.ForEachRow(rows, []any{&userID, &id, &s.Muted, &s.MutedUntil, &s.Level}, func() error {
		out[userID].Channels[id] = s
		return nil
	})
	return err
}
