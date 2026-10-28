package role

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func RoleRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const columns = `id, server_id, name, color, position, permissions, hoist, is_default, is_system, created_at, updated_at`

func scan(row pgx.Row, r *Role) error {
	return row.Scan(&r.ID, &r.ServerID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.Hoist, &r.IsDefault, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt)
}

// List: cargos do servidor, do mais alto para o mais baixo (@everyone por último).
func (r *Repository) List(ctx context.Context, serverID string) ([]Role, error) {
	rows, err := r.db.Query(ctx, `SELECT `+columns+` FROM roles WHERE server_id = $1 ORDER BY position DESC, created_at`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []Role{}
	for rows.Next() {
		var role Role
		if err := scan(rows, &role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// CreateDefaults cria os cargos fixos de um servidor novo: o @everyone e o
// cargo de sistema Bots. Não há cargo de dono nem Moderador padrão: o dono
// manda por ser o dono (owner_id) e os outros cargos o servidor cria.
func (r *Repository) CreateDefaults(ctx context.Context, serverID string) error {
	_, err := r.db.Exec(
		ctx,
		`
		INSERT INTO roles (server_id, name, position, permissions, is_default, is_system, hoist)
		VALUES
			($1, $2, 0, $3, TRUE, FALSE, FALSE),
			($1, $4, 1, 0, FALSE, TRUE, TRUE)
		`,
		serverID,
		permission.EveryoneName,
		permission.DefaultEveryone,
		permission.BotsRoleName,
	)
	return err
}

// Create insere o cargo logo acima dos cargos fixos (@everyone e Bots), subindo os demais.
func (r *Repository) Create(ctx context.Context, role *Role, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE roles SET position = position + 1 WHERE server_id = $1 AND NOT is_default AND NOT is_system`, role.ServerID); err != nil {
			return nil, err
		}
		err := scan(tx.QueryRow(
			ctx,
			`
			INSERT INTO roles (server_id, name, color, position, permissions, hoist)
			VALUES (
				$1,
				$2,
				$3,
				(SELECT COALESCE(MAX(position) + 1, 1) FROM roles WHERE server_id = $1 AND (is_default OR is_system)),
				$4,
				$5
			)
			RETURNING `+columns,
			role.ServerID, role.Name, role.Color, role.Permissions, role.Hoist,
		), role)
		if err != nil {
			return nil, err
		}
		changes := audit.Diff(nil, "permissions", permission.NamesOf(0), permission.NamesOf(role.Permissions))
		return mark.Event(audit.TargetRole, role.ID, role.Name, changes), nil
	})
}

func (r *Repository) Update(ctx context.Context, role *Role, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockRole(ctx, tx, role.ServerID, role.ID)
		if err != nil {
			return nil, err
		}
		err = scan(tx.QueryRow(
			ctx,
			`
			UPDATE roles SET name = $3, color = $4, permissions = $5, hoist = $6, updated_at = NOW()
			WHERE id = $1 AND server_id = $2
			RETURNING `+columns,
			role.ID, role.ServerID, role.Name, role.Color, role.Permissions, role.Hoist,
		), role)
		if err != nil {
			return nil, err
		}
		changes := roleChanges(before, *role)
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetRole, role.ID, role.Name, changes), nil
	})
}

// lockRole trava o cargo e o devolve como estava antes da mudança.
func lockRole(ctx context.Context, tx pgx.Tx, serverID, roleID string) (Role, error) {
	var role Role
	err := scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM roles WHERE id = $1 AND server_id = $2 FOR UPDATE`, roleID, serverID), &role)
	return role, err
}

// Delete apaga o cargo (member_roles vai junto pelo cascade) e as
// sobrescritas de canal que apontavam para ele.
func (r *Repository) Delete(ctx context.Context, serverID, roleID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockRole(ctx, tx, serverID, roleID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRoleNotFound
		}
		if err != nil {
			return nil, err
		}
		tag, err := tx.Exec(ctx, `DELETE FROM roles WHERE id = $1 AND server_id = $2 AND NOT is_default AND NOT is_system`, roleID, serverID)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrRoleNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM channel_overwrites WHERE target_type = 'role' AND target_id = $1`, roleID); err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetRole, roleID, before.Name, nil), nil
	})
}

// SetPositions grava as posições novas (roleID -> posição) numa transação.
func (r *Repository) SetPositions(ctx context.Context, serverID string, positions map[string]int, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		before, err := lockOrderable(ctx, tx, serverID)
		if err != nil {
			return nil, err
		}
		for id, pos := range positions {
			if _, err := tx.Exec(ctx, `UPDATE roles SET position = $3, updated_at = NOW() WHERE id = $1 AND server_id = $2 AND NOT is_default AND NOT is_system`, id, serverID, pos); err != nil {
				return nil, err
			}
		}
		changes := audit.Diff(nil, "order", orderNames(before, nil), orderNames(before, positions))
		if len(changes) == 0 {
			return nil, nil
		}
		return mark.Event(audit.TargetSection, "", sectionRoles, changes), nil
	})
}

// lockOrderable trava os cargos que podem ser ordenados (sem @everyone nem Bots).
func lockOrderable(ctx context.Context, tx pgx.Tx, serverID string) ([]Role, error) {
	rows, err := tx.Query(ctx, `SELECT `+columns+` FROM roles WHERE server_id = $1 AND NOT is_default AND NOT is_system ORDER BY position DESC, created_at FOR UPDATE`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []Role
	for rows.Next() {
		var role Role
		if err := scan(rows, &role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (r *Repository) AddMemberRole(ctx context.Context, serverID, userID, roleID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		tag, err := tx.Exec(
			ctx,
			`INSERT INTO member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			serverID, userID, roleID,
		)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, nil
		}
		name, err := roleNameOf(ctx, tx, roleID)
		if err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetMember, userID, "", []audit.Change{{Field: "role", After: name}}), nil
	})
}

func (r *Repository) RemoveMemberRole(ctx context.Context, serverID, userID, roleID string, mark *audit.Mark) error {
	return audit.Tx(ctx, r.db, func(tx pgx.Tx) (*audit.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3`, serverID, userID, roleID)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, nil
		}
		name, err := roleNameOf(ctx, tx, roleID)
		if err != nil {
			return nil, err
		}
		return mark.Event(audit.TargetMember, userID, "", []audit.Change{{Field: "role", Before: name}}), nil
	})
}

// roleNameOf: nome do cargo ("" se já não existe).
func roleNameOf(ctx context.Context, tx pgx.Tx, roleID string) (string, error) {
	var name string
	err := tx.QueryRow(ctx, `SELECT name FROM roles WHERE id = $1`, roleID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return name, err
}

// MemberRoleIDs: ids dos cargos do membro.
func (r *Repository) MemberRoleIDs(ctx context.Context, serverID, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT role_id::text FROM member_roles WHERE server_id = $1 AND user_id = $2`, serverID, userID)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if errors.Is(err, pgx.ErrNoRows) || ids == nil {
		return []string{}, nil
	}
	return ids, err
}
