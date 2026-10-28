package channel

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func setOverwrite(ctx context.Context, db execer, channelID string, o permission.Overwrite) error {
	_, err := db.Exec(
		ctx,
		`
		INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (channel_id, target_type, target_id) DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny
		`,
		channelID, o.TargetType, o.TargetID, o.Allow, o.Deny,
	)
	return err
}

// SetOverwrite cria ou troca a sobrescrita de um cargo/membro no canal.
func (r *Repository) SetOverwrite(ctx context.Context, channelID string, o permission.Overwrite, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockOverwrite(ctx, tx, channelID, o.TargetType, o.TargetID)
		if err != nil {
			return nil, err
		}
		if err := setOverwrite(ctx, tx, channelID, o); err != nil {
			return nil, err
		}
		return overwriteEvent(ctx, tx, mark, channelID, o.TargetType, o.TargetID, before, o)
	})
}

func (r *Repository) DeleteOverwrite(ctx context.Context, channelID, targetType, targetID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockOverwrite(ctx, tx, channelID, targetType, targetID)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(
			ctx,
			`DELETE FROM channel_overwrites WHERE channel_id = $1 AND target_type = $2 AND target_id = $3`,
			channelID, targetType, targetID,
		); err != nil {
			return nil, err
		}
		return overwriteEvent(ctx, tx, mark, channelID, targetType, targetID, before, permission.Overwrite{})
	})
}

// lockOverwrite trava a sobrescrita e devolve o que ela permitia e negava
// antes da mudança (zerada se ainda não existia).
func lockOverwrite(ctx context.Context, tx pgx.Tx, channelID, targetType, targetID string) (permission.Overwrite, error) {
	var o permission.Overwrite
	err := tx.QueryRow(
		ctx,
		`SELECT allow, deny FROM channel_overwrites WHERE channel_id = $1 AND target_type = $2 AND target_id = $3 FOR UPDATE`,
		channelID, targetType, targetID,
	).Scan(&o.Allow, &o.Deny)
	if errors.Is(err, pgx.ErrNoRows) {
		return permission.Overwrite{}, nil
	}
	return o, err
}

// overwriteEvent: o registro da sobrescrita (nil se não mudou nada ou não há marca).
func overwriteEvent(ctx context.Context, tx pgx.Tx, mark *audit.Mark, channelID, targetType, targetID string, before, after permission.Overwrite) (*audit.Event, error) {
	if mark == nil {
		return nil, nil
	}
	changes := audit.Diff(nil, "allow", permission.NamesOf(before.Allow), permission.NamesOf(after.Allow))
	changes = audit.Diff(changes, "deny", permission.NamesOf(before.Deny), permission.NamesOf(after.Deny))
	if len(changes) == 0 {
		return nil, nil
	}
	targetName, err := overwriteTargetName(ctx, tx, targetType, targetID)
	if err != nil {
		return nil, err
	}
	chName, err := channelNameOf(ctx, tx, channelID)
	if err != nil {
		return nil, err
	}
	changes = append([]audit.Change{{Field: targetType, After: targetName}}, changes...)
	return mark.Event(audit.TargetChannel, channelID, chName, changes), nil
}

// overwriteTargetName: nome do cargo ou do membro da sobrescrita ("" se sumiu).
func overwriteTargetName(ctx context.Context, tx pgx.Tx, targetType, targetID string) (string, error) {
	query := `SELECT name FROM roles WHERE id::text = $1`
	if targetType == permission.TargetMember {
		query = `SELECT display_name FROM users WHERE id::text = $1`
	}
	var name string
	err := tx.QueryRow(ctx, query, targetID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return name, err
}

func channelNameOf(ctx context.Context, tx pgx.Tx, channelID string) (string, error) {
	var name string
	err := tx.QueryRow(ctx, `SELECT name FROM channels WHERE id = $1`, channelID).Scan(&name)
	return name, err
}
