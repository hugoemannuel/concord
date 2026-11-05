package permission

import "sort"

// ChannelInfo: o que o cálculo precisa de um canal.
type ChannelInfo struct {
	ID         string
	Type       string
	Overwrites []Overwrite
	// CategoryID: categoria onde o canal está ("" = solto no topo da lista).
	CategoryID string
}

// Snapshot é o estado de permissões de um servidor inteiro (cargos, quem tem
// qual cargo e as sobrescritas dos canais), lido de uma vez. Com ele dá para
// responder "fulano vê este canal?" para todos os membros sem ir ao banco de
// novo — é o que o WebSocket usa para filtrar quem recebe cada evento.
type Snapshot struct {
	ServerID string
	OwnerID  string
	Everyone Role
	Roles    map[string]Role
	// MemberRoles: userID -> ids dos cargos (sem o @everyone). Estar no mapa
	// é ser membro.
	MemberRoles map[string][]string
	Channels    map[string]ChannelInfo
	Categories  map[string]CategoryInfo
}

// NewSnapshot monta um snapshot à mão (testes e fakes): o @everyone tem id
// "everyone" e as permissões dadas.
func NewSnapshot(serverID, ownerID string, everyonePerms int64) *Snapshot {
	everyone := Role{ID: "everyone", ServerID: serverID, Name: EveryoneName, Permissions: everyonePerms, IsDefault: true}
	return &Snapshot{
		ServerID:    serverID,
		OwnerID:     ownerID,
		Everyone:    everyone,
		Roles:       map[string]Role{everyone.ID: everyone},
		MemberRoles: map[string][]string{},
		Channels:    map[string]ChannelInfo{},
	}
}

func (s *Snapshot) WithRole(id string, position int, perms int64) *Snapshot {
	s.Roles[id] = Role{ID: id, ServerID: s.ServerID, Name: id, Position: position, Permissions: perms}
	return s
}

func (s *Snapshot) WithMember(userID string, roleIDs ...string) *Snapshot {
	s.MemberRoles[userID] = append([]string{}, roleIDs...)
	return s
}

func (s *Snapshot) WithChannel(id string, channelType string, overwrites ...Overwrite) *Snapshot {
	for i := range overwrites {
		overwrites[i].ChannelID = id
	}
	s.Channels[id] = ChannelInfo{ID: id, Type: channelType, Overwrites: overwrites}
	return s
}

func (s *Snapshot) IsMember(userID string) bool {
	_, ok := s.MemberRoles[userID]
	return ok
}

// RolesOf: cargos do membro, do mais alto para o mais baixo (sem @everyone).
func (s *Snapshot) RolesOf(userID string) []Role {
	ids := s.MemberRoles[userID]
	roles := make([]Role, 0, len(ids))
	for _, id := range ids {
		if r, ok := s.Roles[id]; ok && !r.IsDefault {
			roles = append(roles, r)
		}
	}
	sort.Slice(roles, func(i, j int) bool { return roles[i].Position > roles[j].Position })
	return roles
}

// Highest: posição do cargo mais alto do membro (0 se só tem @everyone).
func (s *Snapshot) Highest(userID string) int {
	return HighestPosition(s.RolesOf(userID))
}

// IsOwner: userID é o dono do servidor.
func (s *Snapshot) IsOwner(userID string) bool {
	return userID != "" && userID == s.OwnerID
}

// Server: permissões do membro no servidor (0 se não é membro). Roda a cada
// checagem e por conexão no broadcast: soma os bits sem alocar.
func (s *Snapshot) Server(userID string) int64 {
	roleIDs, ok := s.MemberRoles[userID]
	if !ok {
		return 0
	}
	var rolePerms int64
	for _, id := range roleIDs {
		if r, ok := s.Roles[id]; ok && !r.IsDefault {
			rolePerms |= r.Permissions
		}
	}
	return baseFrom(s.OwnerID, userID, s.Everyone.Permissions, rolePerms)
}

// Channel: permissões do membro no canal (0 se não é membro, se o canal não é
// do servidor ou se o membro não vê a categoria do canal).
func (s *Snapshot) Channel(channelID string, userID string) int64 {
	ch, ok := s.Channels[channelID]
	if !ok || !s.IsMember(userID) || !s.passesCategory(ch, userID) {
		return 0
	}
	return ForChannel(s.Server(userID), ch.Type, ch.Overwrites, s.Everyone.ID, userID, s.MemberRoles[userID])
}

// CanView: atalho para VIEW_CHANNEL no canal.
func (s *Snapshot) CanView(channelID string, userID string) bool {
	return s.Channel(channelID, userID)&ViewChannel != 0
}

// VisibleChannels: ids dos canais que o membro enxerga.
func (s *Snapshot) VisibleChannels(userID string) map[string]bool {
	visible := make(map[string]bool)
	for id := range s.Channels {
		if s.CanView(id, userID) {
			visible[id] = true
		}
	}
	return visible
}

// CanActOn: hierarquia entre dois membros deste servidor.
func (s *Snapshot) CanActOn(actorID, targetID string) bool {
	return CanActOn(s.OwnerID, actorID, targetID, s.Highest(actorID), s.Highest(targetID))
}

// CanEditRolesOf: o ator pode dar ou tirar cargos do alvo?
func (s *Snapshot) CanEditRolesOf(actorID, targetID string) bool {
	return CanEditRolesOf(s.OwnerID, actorID, targetID)
}

// CanManageRole: o ator pode editar/atribuir este cargo?
func (s *Snapshot) CanManageRole(actorID string, role Role) bool {
	return CanManageRole(s.IsOwner(actorID), s.Highest(actorID), role)
}

// CanManageNicknameOf: o ator pode mudar o apelido do alvo neste servidor?
func (s *Snapshot) CanManageNicknameOf(actorID, targetID string) bool {
	return CanManageNicknameOf(s.OwnerID, actorID, targetID, s.Highest(actorID), s.Highest(targetID))
}

// CanDisconnectMember: o ator pode desconectar o alvo da chamada de voz neste servidor?
func (s *Snapshot) CanDisconnectMember(actorID, targetID string) bool {
	return CanDisconnectMember(s.OwnerID, actorID, targetID, s.Highest(actorID), s.Highest(targetID))
}

// CanMoveMember: o ator pode mover o alvo de canal de voz neste servidor?
func (s *Snapshot) CanMoveMember(actorID, targetID string) bool {
	return CanMoveMember(s.OwnerID, actorID, targetID, s.Highest(actorID), s.Highest(targetID))
}
