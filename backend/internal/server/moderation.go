package server

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

var (
	ErrCannotActOn      = errors.New("você não pode fazer isso com alguém de cargo igual ou acima do seu")
	ErrOwnerCannotLeave = errors.New("o dono não pode sair do próprio servidor")
	ErrMemberNotFound   = errors.New("membro não encontrado")
	ErrBanNotFound      = errors.New("esse usuário não está banido")
	ErrReasonTooLong    = errors.New("o motivo pode ter até 512 caracteres")
	ErrCannotTargetSelf = errors.New("você não pode fazer isso consigo mesmo")
)

const maxBanReason = 512

// Motivos de saída do servidor (vão no evento server:removed).
const (
	RemovedLeave = "leave"
	RemovedKick  = "kick"
	RemovedBan   = "ban"
)

// MemberRemovedEvent: alguém saiu, foi expulso ou banido.
type MemberRemovedEvent struct {
	ServerID string `json:"server_id"`
	UserID   string `json:"user_id"`
	Reason   string `json:"reason"`
}

type moderationStore interface {
	RemoveMember(ctx context.Context, serverID, userID string) error
	BanMember(ctx context.Context, serverID, userID, bannedBy string, reason *string) error
	Unban(ctx context.Context, serverID, userID string) (bool, error)
	ListBans(ctx context.Context, serverID string) ([]Ban, error)
}

type snapshots interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// ModerationPublisher: quem sai do servidor perde as salas do WebSocket na
// hora e recebe server:removed; os outros recebem server:member:leave.
type ModerationPublisher interface {
	PublishMemberRemoved(event MemberRemovedEvent)
}

// Moderation expulsa, bane e desbane respeitando permissão e hierarquia.
type Moderation struct {
	store     moderationStore
	perms     snapshots
	publisher ModerationPublisher
	// onRemoved: derruba o usuário da chamada de voz do servidor (main liga no call.Service).
	onRemoved func(ctx context.Context, serverID, userID string)
	audit     AuditRecorder
}

func ModerationService(repository *Repository, perms *permission.Service, publisher ModerationPublisher) *Moderation {
	return newModeration(withPermissionCache(repository, perms), perms, publisher)
}

func newModeration(store moderationStore, perms snapshots, publisher ModerationPublisher) *Moderation {
	return &Moderation{store: store, perms: perms, publisher: publisher}
}

// SetOnRemoved registra o que fazer quando alguém sai do servidor (ex.: sair da call).
func (m *Moderation) SetOnRemoved(fn func(ctx context.Context, serverID, userID string)) {
	m.onRemoved = fn
}

// check: o ator tem want no servidor e está acima do alvo.
func (m *Moderation) check(ctx context.Context, serverID, actorID, targetID string, want int64) (*permission.Snapshot, error) {
	snap, err := m.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(actorID) {
		return nil, permission.ErrNotMember
	}
	if !permission.Has(snap.Server(actorID), want) {
		return nil, permission.ErrMissingPermission
	}
	if actorID == targetID {
		return nil, ErrCannotTargetSelf
	}
	if !snap.CanActOn(actorID, targetID) {
		return nil, ErrCannotActOn
	}
	return snap, nil
}

func (m *Moderation) Kick(ctx context.Context, serverID, actorID, targetID string) error {
	snap, err := m.check(ctx, serverID, actorID, targetID, permission.KickMembers)
	if err != nil {
		return err
	}
	if !snap.IsMember(targetID) {
		return ErrMemberNotFound
	}
	if err := m.store.RemoveMember(ctx, serverID, targetID); err != nil {
		return err
	}
	record(ctx, m.audit, memberEvent(serverID, actorID, audit.MemberKick, targetID))
	m.removed(ctx, serverID, targetID, RemovedKick)
	return nil
}

// Ban vale também para quem já não é membro (bane antes de voltar).
func (m *Moderation) Ban(ctx context.Context, serverID, actorID, targetID, reason string) error {
	snap, err := m.check(ctx, serverID, actorID, targetID, permission.BanMembers)
	if err != nil {
		return err
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) > maxBanReason {
		return ErrReasonTooLong
	}
	var reasonPtr *string
	if reason != "" {
		reasonPtr = &reason
	}
	wasMember := snap.IsMember(targetID)
	if err := m.store.BanMember(ctx, serverID, targetID, actorID, reasonPtr); err != nil {
		return err
	}
	banned := memberEvent(serverID, actorID, audit.MemberBan, targetID)
	banned.Reason = reason
	record(ctx, m.audit, banned)
	if wasMember {
		m.removed(ctx, serverID, targetID, RemovedBan)
	}
	return nil
}

func (m *Moderation) Unban(ctx context.Context, serverID, actorID, targetID string) error {
	if err := m.requireBan(ctx, serverID, actorID); err != nil {
		return err
	}
	found, err := m.store.Unban(ctx, serverID, targetID)
	if err != nil {
		return err
	}
	if !found {
		return ErrBanNotFound
	}
	record(ctx, m.audit, memberEvent(serverID, actorID, audit.MemberUnban, targetID))
	return nil
}

func (m *Moderation) ListBans(ctx context.Context, serverID, actorID string) ([]Ban, error) {
	if err := m.requireBan(ctx, serverID, actorID); err != nil {
		return nil, err
	}
	return m.store.ListBans(ctx, serverID)
}

func (m *Moderation) requireBan(ctx context.Context, serverID, actorID string) error {
	snap, err := m.perms.Snapshot(ctx, serverID)
	if err != nil {
		return err
	}
	if !snap.IsMember(actorID) {
		return permission.ErrNotMember
	}
	if !permission.Has(snap.Server(actorID), permission.BanMembers) {
		return permission.ErrMissingPermission
	}
	return nil
}

// Leave: o próprio membro sai. O dono não sai (apaga o servidor).
func (m *Moderation) Leave(ctx context.Context, serverID, userID string) error {
	snap, err := m.perms.Snapshot(ctx, serverID)
	if err != nil {
		return err
	}
	if !snap.IsMember(userID) {
		return permission.ErrNotMember
	}
	if snap.IsOwner(userID) {
		return ErrOwnerCannotLeave
	}
	if err := m.store.RemoveMember(ctx, serverID, userID); err != nil {
		return err
	}
	record(ctx, m.audit, memberEvent(serverID, userID, audit.MemberLeave, userID))
	m.removed(ctx, serverID, userID, RemovedLeave)
	return nil
}

func (m *Moderation) removed(ctx context.Context, serverID, userID, reason string) {
	if m.onRemoved != nil {
		m.onRemoved(ctx, serverID, userID)
	}
	if m.publisher != nil {
		m.publisher.PublishMemberRemoved(MemberRemovedEvent{ServerID: serverID, UserID: userID, Reason: reason})
	}
}
