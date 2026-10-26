package role

import (
	"context"
	"strings"
	"unicode/utf8"

	"gin-quickstart/backend/internal/permission"
)

type EventPublisher interface {
	PublishRoleCreate(event RoleEvent)
	PublishRoleUpdate(event RoleEvent)
	PublishRoleDelete(event DeleteEvent)
	PublishRoleReorder(event ReorderEvent)
	PublishMemberRoles(event MemberRolesEvent)
	// PublishPermissionsChanged: algo mudou o que os membros veem (o app busca
	// os canais de novo e o servidor tira das salas quem perdeu acesso).
	PublishPermissionsChanged(serverID string)
}

// store é o que o Service usa do Repository (nos testes, um fake em memória).
type store interface {
	List(ctx context.Context, serverID string) ([]Role, error)
	Create(ctx context.Context, role *Role) error
	Update(ctx context.Context, role *Role) error
	Delete(ctx context.Context, serverID, roleID string) error
	SetPositions(ctx context.Context, serverID string, positions map[string]int) error
	AddMemberRole(ctx context.Context, serverID, userID, roleID string) error
	RemoveMemberRole(ctx context.Context, serverID, userID, roleID string) error
	MemberRoleIDs(ctx context.Context, serverID, userID string) ([]string, error)
}

type snapshots interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

type Service struct {
	repository store
	perms      snapshots
	publisher  EventPublisher
}

func RoleService(repository *Repository, perms *permission.Service, publisher EventPublisher) *Service {
	return newService(repository, perms, publisher)
}

func newService(repository store, perms snapshots, publisher EventPublisher) *Service {
	return &Service{repository: repository, perms: perms, publisher: publisher}
}

// actor carrega o snapshot e confere que o ator é membro com MANAGE_ROLES.
func (s *Service) actor(ctx context.Context, serverID, actorID string) (*permission.Snapshot, int64, error) {
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, 0, err
	}
	if !snap.IsMember(actorID) {
		return nil, 0, permission.ErrNotMember
	}
	perms := snap.Server(actorID)
	if !permission.Has(perms, permission.ManageRoles) {
		return nil, 0, permission.ErrMissingPermission
	}
	return snap, perms, nil
}

// List: qualquer membro vê os cargos (a lista de membros usa cor e grupo).
func (s *Service) List(ctx context.Context, serverID, userID string) ([]Role, error) {
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(userID) {
		return nil, permission.ErrNotMember
	}
	return s.repository.List(ctx, serverID)
}

func (s *Service) Create(ctx context.Context, serverID, actorID string, in Input) (*Role, error) {
	snap, actorPerms, err := s.actor(ctx, serverID, actorID)
	if err != nil {
		return nil, err
	}
	customCount := 0
	for _, r := range snap.Roles {
		if !r.IsDefault && !r.IsSystem {
			customCount++
		}
	}
	if customCount >= MaxRoles {
		return nil, ErrTooManyRoles
	}

	role := &Role{ServerID: serverID, Name: "novo cargo"}
	if err := apply(role, in, actorPerms); err != nil {
		return nil, err
	}
	if err := s.repository.Create(ctx, role); err != nil {
		return nil, err
	}

	if s.publisher != nil {
		s.publisher.PublishRoleCreate(RoleEvent{ServerID: serverID, Role: *role})
		s.publishOrder(ctx, serverID)
		if role.Permissions != 0 {
			s.publisher.PublishPermissionsChanged(serverID)
		}
	}
	return role, nil
}

func (s *Service) Update(ctx context.Context, serverID, actorID, roleID string, in Input) (*Role, error) {
	snap, actorPerms, err := s.actor(ctx, serverID, actorID)
	if err != nil {
		return nil, err
	}
	current, ok := snap.Roles[roleID]
	if !ok {
		return nil, ErrRoleNotFound
	}
	if !snap.CanManageRole(actorID, current) {
		return nil, ErrRoleHierarchy
	}
	if current.IsDefault && (in.Name != nil || in.Color != nil || in.ClearColor || in.Hoist != nil) {
		return nil, ErrEveryoneRole
	}
	if current.IsSystem && (in.Name != nil || in.Hoist != nil) {
		return nil, ErrBotRole
	}

	updated := current
	if err := apply(&updated, in, actorPerms); err != nil {
		return nil, err
	}
	if err := s.repository.Update(ctx, &updated); err != nil {
		return nil, err
	}

	if s.publisher != nil {
		s.publisher.PublishRoleUpdate(RoleEvent{ServerID: serverID, Role: updated})
		if updated.Permissions != current.Permissions {
			s.publisher.PublishPermissionsChanged(serverID)
		}
	}
	return &updated, nil
}

// apply valida e copia os campos de in para role. As permissões só mudam nos
// bits que o ator tem (CanGrant).
func apply(role *Role, in Input, actorPerms int64) error {
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" || utf8.RuneCountInString(name) > maxNameLength || name == permission.EveryoneName || (!role.IsSystem && strings.EqualFold(name, permission.BotsRoleName)) {
			return ErrInvalidName
		}
		role.Name = name
	}
	if in.ClearColor {
		role.Color = nil
	} else if in.Color != nil {
		if *in.Color < 0 || *in.Color > 0xFFFFFF {
			return ErrInvalidColor
		}
		color := *in.Color
		role.Color = &color
	}
	if in.Hoist != nil {
		role.Hoist = *in.Hoist
	}
	if in.Permissions != nil {
		next := permission.Normalize(*in.Permissions)
		if !permission.CanGrant(actorPerms, role.Permissions^next) {
			return ErrCannotGrant
		}
		role.Permissions = next
	}
	return nil
}

func (s *Service) Delete(ctx context.Context, serverID, actorID, roleID string) error {
	snap, _, err := s.actor(ctx, serverID, actorID)
	if err != nil {
		return err
	}
	current, ok := snap.Roles[roleID]
	if !ok {
		return ErrRoleNotFound
	}
	if current.IsDefault {
		return ErrEveryoneRole
	}
	if current.IsSystem {
		return ErrBotRole
	}
	if !snap.CanManageRole(actorID, current) {
		return ErrRoleHierarchy
	}
	if err := s.repository.Delete(ctx, serverID, roleID); err != nil {
		return err
	}
	if s.publisher != nil {
		s.publisher.PublishRoleDelete(DeleteEvent{ServerID: serverID, RoleID: roleID})
		s.publisher.PublishPermissionsChanged(serverID)
	}
	return nil
}

// Reorder recebe todos os cargos ordenáveis (sem o @everyone e sem o cargo de
// sistema Bots, ou com Bots fixo no final) do mais alto para o mais baixo. Todo
// cargo que muda de posição tem que estar abaixo do cargo mais alto do ator
// antes e depois.
func (s *Service) Reorder(ctx context.Context, serverID, actorID string, roleIDs []string) ([]Role, error) {
	snap, _, err := s.actor(ctx, serverID, actorID)
	if err != nil {
		return nil, err
	}

	positions, err := NewPositions(snap, roleIDs)
	if err != nil {
		return nil, err
	}
	isOwner := snap.IsOwner(actorID)
	highest := snap.Highest(actorID)
	changed := map[string]int{}
	for id, pos := range positions {
		current := snap.Roles[id]
		if current.Position == pos {
			continue
		}
		if !isOwner && (current.Position >= highest || pos >= highest) {
			return nil, ErrRoleHierarchy
		}
		changed[id] = pos
	}

	if len(changed) > 0 {
		if err := s.repository.SetPositions(ctx, serverID, changed); err != nil {
			return nil, err
		}
	}
	roles, err := s.repository.List(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if len(changed) > 0 && s.publisher != nil {
		s.publisher.PublishRoleReorder(ReorderEvent{ServerID: serverID, Roles: roles})
		s.publisher.PublishPermissionsChanged(serverID)
	}
	return roles, nil
}

// NewPositions confere que roleIDs são exatamente os cargos ordenáveis do
// servidor (sem @everyone, sem repetir; o cargo Bots fica sempre na posição 1,
// abaixo de todos os demais cargos) e devolve a posição de cada um.
func NewPositions(snap *permission.Snapshot, roleIDs []string) (map[string]int, error) {
	customCount := 0
	base := 0
	for _, r := range snap.Roles {
		if r.IsSystem {
			base = 1
		} else if !r.IsDefault {
			customCount++
		}
	}

	orderable := roleIDs
	for i, id := range roleIDs {
		if r, ok := snap.Roles[id]; ok && r.IsSystem {
			if i != len(roleIDs)-1 {
				return nil, ErrBotRole
			}
			orderable = roleIDs[:len(roleIDs)-1]
			break
		}
	}

	if len(orderable) != customCount {
		return nil, ErrInvalidOrder
	}
	positions := make(map[string]int, len(orderable))
	for i, id := range orderable {
		r, ok := snap.Roles[id]
		if !ok || r.IsDefault || r.IsSystem {
			return nil, ErrInvalidOrder
		}
		if _, dup := positions[id]; dup {
			return nil, ErrInvalidOrder
		}
		positions[id] = len(orderable) - i + base
	}
	return positions, nil
}

// SetMemberRole dá (add) ou tira um cargo de um membro. Basta o cargo estar
// abaixo do cargo mais alto do ator (como no Discord).
func (s *Service) SetMemberRole(ctx context.Context, serverID, actorID, targetID, roleID string, add bool) ([]string, error) {
	snap, _, err := s.actor(ctx, serverID, actorID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(targetID) {
		return nil, ErrMemberNotFound
	}
	current, ok := snap.Roles[roleID]
	if !ok {
		return nil, ErrRoleNotFound
	}
	if current.IsDefault {
		return nil, ErrEveryoneRole
	}
	if current.IsSystem {
		return nil, ErrBotRole
	}
	if !snap.CanManageRole(actorID, current) {
		return nil, ErrRoleHierarchy
	}

	if add {
		err = s.repository.AddMemberRole(ctx, serverID, targetID, roleID)
	} else {
		err = s.repository.RemoveMemberRole(ctx, serverID, targetID, roleID)
	}
	if err != nil {
		return nil, err
	}
	ids, err := s.repository.MemberRoleIDs(ctx, serverID, targetID)
	if err != nil {
		return nil, err
	}
	if s.publisher != nil {
		s.publisher.PublishMemberRoles(MemberRolesEvent{ServerID: serverID, UserID: targetID, RoleIDs: ids})
		s.publisher.PublishPermissionsChanged(serverID)
	}
	return ids, nil
}

// SetModerator é o atalho do app antigo ("Tornar moderador"): põe ou tira o
// cargo Moderador.
func (s *Service) SetModerator(ctx context.Context, serverID, actorID, targetID string, moderator bool) ([]string, error) {
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	for _, r := range snap.Roles {
		if !r.IsDefault && r.Name == permission.ModeratorName {
			return s.SetMemberRole(ctx, serverID, actorID, targetID, r.ID, moderator)
		}
	}
	return nil, ErrNoModeratorRole
}

func (s *Service) publishOrder(ctx context.Context, serverID string) {
	roles, err := s.repository.List(ctx, serverID)
	if err == nil {
		s.publisher.PublishRoleReorder(ReorderEvent{ServerID: serverID, Roles: roles})
	}
}
