package event

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// EventActions: o que a pessoa pode fazer com os eventos do servidor. O dono
// pode tudo; os demais, a soma do que o dono liberou para cada cargo deles.
func (r *Repository) EventActions(ctx context.Context, serverID, userID string) (Actions, error) {
	if uuid.Validate(serverID) != nil || uuid.Validate(userID) != nil {
		return 0, nil
	}
	var owner bool
	var mask int16
	err := r.db.QueryRow(ctx, `
		SELECT s.owner_id = $2, COALESCE(BIT_OR(a.actions), 0)::smallint
		FROM servers s
		LEFT JOIN member_roles mr ON mr.server_id = s.id AND mr.user_id = $2
		LEFT JOIN event_role_actions a ON a.role_id = mr.role_id
		WHERE s.id = $1
		GROUP BY s.owner_id`, serverID, userID).Scan(&owner, &mask)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if owner {
		return AllActions, nil
	}
	return Actions(mask) & AllActions, nil
}

// IsOwner diz se a pessoa é a dona do servidor.
func (r *Repository) IsOwner(ctx context.Context, serverID, userID string) (bool, error) {
	if uuid.Validate(serverID) != nil || uuid.Validate(userID) != nil {
		return false, nil
	}
	var owner bool
	err := r.db.QueryRow(ctx, `SELECT owner_id = $2 FROM servers WHERE id = $1`, serverID, userID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return owner, err
}

// RoleAccessList: os cargos que o dono pode configurar (sem o @everyone nem o
// cargo dos bots), do mais alto ao mais baixo, com o que cada um já pode.
func (r *Repository) RoleAccessList(ctx context.Context, serverID string) ([]RoleAccess, error) {
	if uuid.Validate(serverID) != nil {
		return []RoleAccess{}, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT r.id, r.name, COALESCE(a.actions, 0)
		FROM roles r
		LEFT JOIN event_role_actions a ON a.role_id = r.id
		WHERE r.server_id = $1 AND NOT r.is_default AND NOT r.is_system
		ORDER BY r.position DESC, lower(r.name), r.id`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]RoleAccess, 0)
	for rows.Next() {
		var item RoleAccess
		var mask int16
		if err := rows.Scan(&item.RoleID, &item.Name, &mask); err != nil {
			return nil, err
		}
		actions := Actions(mask)
		item.Create, item.Edit, item.Delete = actions.Has(ActionCreate), actions.Has(ActionEdit), actions.Has(ActionDelete)
		item.Configure = actions.Has(ActionConfigure)
		out = append(out, item)
	}
	return out, rows.Err()
}

// SetRoleActions grava o que o cargo pode fazer (0 tira tudo). Só vale para
// cargo deste servidor que não seja o @everyone nem o dos bots.
func (r *Repository) SetRoleActions(ctx context.Context, serverID, roleID string, actions Actions) error {
	if uuid.Validate(serverID) != nil || uuid.Validate(roleID) != nil {
		return ErrRoleNotFound
	}
	if actions == 0 {
		return r.clearRoleActions(ctx, serverID, roleID)
	}
	tag, err := r.db.Exec(ctx, `
		INSERT INTO event_role_actions (role_id, server_id, actions)
		SELECT id, server_id, $3 FROM roles
		WHERE id = $2 AND server_id = $1 AND NOT is_default AND NOT is_system
		ON CONFLICT (role_id) DO UPDATE SET actions = EXCLUDED.actions`,
		serverID, roleID, int16(actions&AllActions))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoleNotFound
	}
	return nil
}

// clearRoleActions tira a linha do cargo; cargo que não existe (ou é do
// @everyone ou dos bots) continua sendo erro.
func (r *Repository) clearRoleActions(ctx context.Context, serverID, roleID string) error {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM roles WHERE id = $2 AND server_id = $1 AND NOT is_default AND NOT is_system)`,
		serverID, roleID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return ErrRoleNotFound
	}
	_, err = r.db.Exec(ctx, `DELETE FROM event_role_actions WHERE role_id = $1`, roleID)
	return err
}
