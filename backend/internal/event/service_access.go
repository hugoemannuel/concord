package event

import (
	"context"
	"fmt"

	"gin-quickstart/backend/internal/audit"
)

// Access diz o que a pessoa pode fazer com os eventos (para o app mostrar só os
// botões que valem). Quem não é membro do servidor não vê nada.
func (s *Service) Access(ctx context.Context, serverID, userID string) (AccessView, error) {
	if err := s.requireMember(ctx, serverID, userID); err != nil {
		return AccessView{}, err
	}
	actions, err := s.access.EventActions(ctx, serverID, userID)
	if err != nil {
		return AccessView{}, fmt.Errorf("conferir permissões: %w", err)
	}
	owner, err := s.access.IsOwner(ctx, serverID, userID)
	if err != nil {
		return AccessView{}, fmt.Errorf("conferir dono: %w", err)
	}
	return AccessView{
		Create:    actions.Has(ActionCreate),
		Edit:      actions.Has(ActionEdit),
		Delete:    actions.Has(ActionDelete),
		Configure: actions.Has(ActionConfigure),
		Owner:     owner,
	}, nil
}

// requireConfigure: abrir e mudar a configuração por cargo é do dono e dos cargos a
// que ele deu "configurar". Quem tem só criar, editar e excluir (ou Administrador) não pode.
func (s *Service) requireConfigure(ctx context.Context, serverID, userID string) (owner bool, err error) {
	owner, err = s.access.IsOwner(ctx, serverID, userID)
	if err != nil {
		return false, fmt.Errorf("conferir dono: %w", err)
	}
	if owner {
		return true, nil
	}
	return false, s.requireAction(ctx, serverID, userID, ActionConfigure)
}

// RoleSettings lista os cargos do servidor e o que cada um pode fazer com os eventos.
func (s *Service) RoleSettings(ctx context.Context, serverID, userID string) ([]RoleAccess, error) {
	if _, err := s.requireConfigure(ctx, serverID, userID); err != nil {
		return nil, err
	}
	return s.access.RoleAccessList(ctx, serverID)
}

// SetRoleActions muda o que um cargo pode fazer com os eventos e avisa o app, que
// recalcula os botões de todo mundo. Quem não é o dono só mexe em criar, editar e
// excluir: o "configurar" do cargo fica como está (só o dono liga e desliga).
func (s *Service) SetRoleActions(ctx context.Context, serverID, actorID, roleID string, actions Actions) error {
	owner, err := s.requireConfigure(ctx, serverID, actorID)
	if err != nil {
		return err
	}
	if !owner {
		if actions, err = s.keepConfigure(ctx, serverID, roleID, actions); err != nil {
			return err
		}
	}
	if err := s.access.SetRoleActions(ctx, serverID, roleID, actions); err != nil {
		return err
	}
	s.broadcast(serverID, "event:access", map[string]string{"server_id": serverID})
	s.record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: audit.EventAccess,
		TargetType: audit.TargetRole, TargetID: roleID,
		Changes: []audit.Change{{Field: "event_actions", After: int(actions)}},
	})
	return nil
}

// keepConfigure troca o bit de "configurar" do pedido pelo que o cargo já tem.
func (s *Service) keepConfigure(ctx context.Context, serverID, roleID string, requested Actions) (Actions, error) {
	roles, err := s.access.RoleAccessList(ctx, serverID)
	if err != nil {
		return 0, fmt.Errorf("ler cargos: %w", err)
	}
	for _, r := range roles {
		if r.RoleID == roleID {
			requested &^= ActionConfigure
			if r.Configure {
				requested |= ActionConfigure
			}
			return requested, nil
		}
	}
	return 0, ErrRoleNotFound
}
