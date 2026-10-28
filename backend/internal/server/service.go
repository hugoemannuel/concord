package server

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/bot"

	"github.com/google/uuid"
)

var (
	ErrOnlyOwnerBot     = errors.New("só o dono do servidor pode remover ou adicionar o Maestro")
	ErrInviteNotFound   = errors.New("invite not found")
	ErrNotInvitee       = errors.New("you are not the invitee")
	ErrInviteNotPending = errors.New("invite is not pending")
	ErrAlreadyMember    = errors.New("you are already a member of this server")
	ErrInvalidCode      = errors.New("código de convite inválido")
	ErrNotServerMember  = errors.New("you are not a member of this server")
	ErrBanned           = errors.New("você foi banido deste servidor")
)

// RoleDefaults cria os cargos fixos (@everyone e Bots) de um servidor novo.
type RoleDefaults interface {
	CreateDefaults(ctx context.Context, serverID string) error
}

type EventPublisher interface {
	PublishServerUpdate(event UpdateEvent)
	PublishServerDelete(event DeleteEvent)
	PublishMemberJoin(event MemberJoinEvent)
	PublishMemberLeave(event MemberLeaveEvent)
	PublishMemberUpdate(event MemberJoinEvent)
}

type Service struct {
	repository *Repository
	publisher  EventPublisher
	roles      RoleDefaults
	presence   PresenceLookup
	previews   *previewCache

	// Chamados quando o Maestro é removido de um servidor (fecha o player dele).
	onMusicBotDisabled []func(serverID string)
	// Chamados quando um usuário novo entra no servidor (posta boas-vindas no canal "avisos").
	onMemberJoined []func(ctx context.Context, serverID string, member ServerMember)
}

func ServerService(repository *Repository, publisher EventPublisher, roles RoleDefaults) *Service {
	return &Service{
		repository: repository,
		publisher:  publisher,
		roles:      roles,
		previews:   newPreviewCache(invitePreviewTTL, invitePreviewMaxKeys),
	}
}

func (s *Service) Create(
	ctx context.Context,
	server *Server,
) error {
	if server.Name == "" {
		return errors.New("name is required")
	}

	if server.OwnerID == "" {
		return errors.New("owner_id is required")
	}

	server.ID = uuid.New().String()

	if err := s.repository.Create(ctx, server); err != nil {
		return err
	}

	if s.roles != nil {
		if err := s.roles.CreateDefaults(ctx, server.ID); err != nil {
			return err
		}
	}

	member := &ServerMember{}
	if err := s.repository.AddingUserServer(ctx, server, member, server.OwnerID, "member", nil); err != nil {
		return err
	}

	fullMember, err := s.repository.FindMemberByUserID(ctx, server.ID, server.OwnerID)
	if err == nil && s.publisher != nil {
		s.publisher.PublishMemberJoin(MemberJoinEvent{
			ServerID: server.ID,
			Member:   *fullMember,
		})
	}

	// Todo servidor nasce com o Maestro (o dono pode remover depois).
	if err := s.repository.AddMemberIfMissing(ctx, server.ID, bot.UserID, "member"); err != nil {
		return err
	}
	if botMember, err := s.repository.FindMemberByUserID(ctx, server.ID, bot.UserID); err == nil && s.publisher != nil {
		s.publisher.PublishMemberJoin(MemberJoinEvent{ServerID: server.ID, Member: *botMember})
	}

	return nil
}

// OnMusicBotDisabled registra um hook para a remoção do Maestro (só no boot).
func (s *Service) OnMusicBotDisabled(fn func(serverID string)) {
	s.onMusicBotDisabled = append(s.onMusicBotDisabled, fn)
}

func (s *Service) notifyMusicBotDisabled(serverID string) {
	for _, fn := range s.onMusicBotDisabled {
		fn(serverID)
	}
}

// OnMemberJoined registra um hook para quando um usuário novo entra no servidor.
func (s *Service) OnMemberJoined(fn func(ctx context.Context, serverID string, member ServerMember)) {
	s.onMemberJoined = append(s.onMemberJoined, fn)
}

func (s *Service) notifyMemberJoined(ctx context.Context, serverID string, member ServerMember) {
	for _, fn := range s.onMemberJoined {
		fn(ctx, serverID, member)
	}
}

// NotifyMemberJoined dispara o hook de entrada para userID no servidor (ex.: dono na criação).
func (s *Service) NotifyMemberJoined(ctx context.Context, serverID, userID string) {
	if s.repository == nil || len(s.onMemberJoined) == 0 {
		return
	}
	if fullMember, err := s.repository.FindMemberByUserID(ctx, serverID, userID); err == nil {
		s.notifyMemberJoined(ctx, serverID, *fullMember)
	}
}

// SetMusicBot remove (enabled=false) ou readiciona o Maestro. Só o dono.
func (s *Service) SetMusicBot(ctx context.Context, serverID, actorID string, enabled bool) error {
	srv, err := s.repository.FindByID(ctx, serverID)
	if err != nil {
		return err
	}
	if srv.OwnerID != actorID {
		return ErrOnlyOwnerBot
	}
	if !enabled {
		if err := s.repository.RemoveMember(ctx, serverID, bot.UserID, nil); err != nil {
			return err
		}
		if s.publisher != nil {
			s.publisher.PublishMemberLeave(MemberLeaveEvent{ServerID: serverID, UserID: bot.UserID})
		}
		s.notifyMusicBotDisabled(serverID)
		return nil
	}
	if err := s.repository.AddMemberIfMissing(ctx, serverID, bot.UserID, "member"); err != nil {
		return err
	}
	if m, err := s.repository.FindMemberByUserID(ctx, serverID, bot.UserID); err == nil && s.publisher != nil {
		s.publisher.PublishMemberJoin(MemberJoinEvent{ServerID: serverID, Member: *m})
	}
	return nil
}

func (s *Service) FindByID(ctx context.Context, id string) (*Server, error) {
	return s.repository.FindByID(ctx, id)
}

func (s *Service) ListByUserID(ctx context.Context, userID string) ([]Server, error) {
	return s.repository.ListByUserID(ctx, userID)
}

func (s *Service) ListMembers(ctx context.Context, serverID string) ([]ServerMember, error) {
	return s.repository.ListMembers(ctx, serverID)
}

func (s *Service) IsMember(ctx context.Context, serverID string, userID string) (bool, error) {
	return s.repository.IsMember(ctx, serverID, userID)
}

func (s *Service) InviteUser(ctx context.Context, serverID string, inviterID string, inviteeID string) error {
	if banned, err := s.repository.IsBanned(ctx, serverID, inviteeID); err != nil {
		return err
	} else if banned {
		return ErrBanned
	}
	invite := &ServerInvite{
		ID:        uuid.New().String(),
		ServerID:  serverID,
		InviterID: inviterID,
		InviteeID: inviteeID,
	}
	return s.repository.CreateInvite(ctx, invite)
}

func (s *Service) FindPendingInvite(ctx context.Context, serverID string, inviteeID string) (*ServerInvite, error) {
	return s.repository.FindPendingInvite(ctx, serverID, inviteeID)
}

func (s *Service) ListInvitesByInvitee(ctx context.Context, inviteeID string) ([]ServerInvite, error) {
	return s.repository.ListInvitesByInvitee(ctx, inviteeID)
}

func (s *Service) ListInvitesByServer(ctx context.Context, serverID string) ([]ServerInvite, error) {
	return s.repository.ListInvitesByServer(ctx, serverID)
}

func (s *Service) AcceptInvite(ctx context.Context, inviteID string, userID string) error {
	invite, err := s.repository.FindInviteByID(ctx, inviteID)
	if err != nil {
		return ErrInviteNotFound
	}

	if invite.InviteeID != userID {
		return ErrNotInvitee
	}

	if invite.Status != "pending" {
		return ErrInviteNotPending
	}

	isMember, err := s.repository.IsMember(ctx, invite.ServerID, userID)
	if err != nil {
		return err
	}
	if isMember {
		return ErrAlreadyMember
	}
	if banned, err := s.repository.IsBanned(ctx, invite.ServerID, userID); err != nil {
		return err
	} else if banned {
		return ErrBanned
	}

	member := &ServerMember{}
	mark := &audit.Mark{ServerID: invite.ServerID, ActorID: userID, Action: audit.MemberJoin}
	if err := s.repository.AddingUserServer(ctx, &Server{ID: invite.ServerID}, member, userID, "member", mark); err != nil {
		return err
	}

	if err := s.repository.UpdateInviteStatus(ctx, inviteID, "accepted"); err != nil {
		return err
	}

	fullMember, err := s.repository.FindMemberByUserID(ctx, invite.ServerID, userID)
	if err == nil && s.publisher != nil {
		s.publisher.PublishMemberJoin(MemberJoinEvent{
			ServerID: invite.ServerID,
			Member:   *fullMember,
		})
	}
	if err == nil {
		s.notifyMemberJoined(ctx, invite.ServerID, *fullMember)
	}

	return nil
}

// InviteCode devolve o código de convite do servidor, criando na primeira vez.
// Qualquer membro pode ver e compartilhar.
func (s *Service) InviteCode(ctx context.Context, serverID string, userID string) (string, error) {
	isMember, err := s.repository.IsMember(ctx, serverID, userID)
	if err != nil {
		return "", err
	}
	if !isMember {
		return "", ErrNotServerMember
	}

	code, err := s.repository.InviteCode(ctx, serverID)
	if err != nil || code != "" {
		return code, err
	}
	if err := s.repository.SetInviteCodeIfMissing(ctx, serverID, newInviteCode()); err != nil {
		return "", err
	}
	return s.repository.InviteCode(ctx, serverID)
}

// JoinByCode coloca o usuário no servidor do código. Já sendo membro, só
// devolve o servidor (entrar de novo não é erro).
func (s *Service) JoinByCode(ctx context.Context, rawCode string, userID string) (*Server, error) {
	code := normalizeInviteCode(rawCode)
	if code == "" {
		return nil, ErrInvalidCode
	}
	serverID, err := s.repository.FindIDByInviteCode(ctx, code)
	if err != nil {
		return nil, ErrInvalidCode
	}

	isMember, err := s.repository.IsMember(ctx, serverID, userID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		if banned, err := s.repository.IsBanned(ctx, serverID, userID); err != nil {
			return nil, err
		} else if banned {
			return nil, ErrBanned
		}
		member := &ServerMember{}
		mark := &audit.Mark{ServerID: serverID, ActorID: userID, Action: audit.MemberJoin}
		if err := s.repository.AddingUserServer(ctx, &Server{ID: serverID}, member, userID, "member", mark); err != nil {
			return nil, err
		}
		// A prévia do convite mostra o número de membros: entrou, conta já.
		s.previews.forgetServer(serverID)
		fullMember, err := s.repository.FindMemberByUserID(ctx, serverID, userID)
		if err == nil && s.publisher != nil {
			s.publisher.PublishMemberJoin(MemberJoinEvent{ServerID: serverID, Member: *fullMember})
		}
		if err == nil {
			s.notifyMemberJoined(ctx, serverID, *fullMember)
		}
	}

	return s.repository.FindByID(ctx, serverID)
}

// CanDirectMessage: DM é liberada entre amigos ou entre quem divide um
// servidor (como no Discord). Aqui só a parte do servidor.
func (s *Service) SharesServer(ctx context.Context, userA string, userB string) (bool, error) {
	return s.repository.SharesServer(ctx, userA, userB)
}

func (s *Service) DeclineInvite(ctx context.Context, inviteID string, userID string) error {
	invite, err := s.repository.FindInviteByID(ctx, inviteID)
	if err != nil {
		return ErrInviteNotFound
	}

	if invite.InviteeID != userID {
		return ErrNotInvitee
	}

	if invite.Status != "pending" {
		return ErrInviteNotPending
	}

	return s.repository.UpdateInviteStatus(ctx, inviteID, "declined")
}

func (s *Service) MutualServers(ctx context.Context, userA string, userB string) ([]MutualServer, error) {
	return s.repository.MutualServers(ctx, userA, userB)
}
