package server

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/user"
)

// MaxNickname: o apelido segue as regras do nome de exibição (até 32
// caracteres, sem espaços nas pontas). A coluna da migration 000039 tem o
// mesmo tamanho.
const MaxNickname = user.MaxDisplayName

// ErrInvalidNickname vale para todo apelido recusado (400, invalid_nickname);
// a mensagem diz o motivo.
var ErrInvalidNickname = errors.New("apelido inválido")

// NormalizeNickname tira os espaços das pontas e confere o apelido com as
// regras do nome de exibição (user.NormalizeName): até 32 caracteres (conta
// caractere, não byte), sem caractere invisível, de controle (NUL incluso) ou
// de bidi. Vazio vira nil: tira o apelido.
func NormalizeNickname(raw string) (*string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	nick, err := user.NormalizeName(raw, MaxNickname)
	switch {
	case errors.Is(err, user.ErrNameTooLong):
		return nil, fmt.Errorf("%w: o apelido pode ter até %d caracteres", ErrInvalidNickname, MaxNickname)
	case err != nil:
		return nil, fmt.Errorf("%w: o apelido não pode ter caracteres invisíveis ou de controle", ErrInvalidNickname)
	}
	return &nick, nil
}

// NicknameEvent: o apelido de alguém mudou no servidor (nil = tirou).
type NicknameEvent struct {
	ServerID string  `json:"server_id"`
	UserID   string  `json:"user_id"`
	Nickname *string `json:"nickname"`
}

type nicknameStore interface {
	// SetNickname grava o apelido; false se a pessoa não é (mais) membro.
	SetNickname(ctx context.Context, serverID, userID string, nickname *string, mark *audit.Mark) (bool, error)
}

// NicknamePublisher avisa o servidor inteiro (server:member:nickname).
type NicknamePublisher interface {
	PublishMemberNickname(event NicknameEvent)
}

// Nicknames muda o apelido de membros: o próprio com CHANGE_NICKNAME, o dos
// outros com MANAGE_NICKNAMES e só de quem está abaixo na hierarquia (a mesma
// regra de expulsar e banir: o dono nunca é alvo).
type Nicknames struct {
	store     nicknameStore
	perms     snapshots
	publisher NicknamePublisher
}

func NicknameService(repository *Repository, perms *permission.Service, publisher NicknamePublisher) *Nicknames {
	return newNicknames(repository, perms, publisher)
}

func newNicknames(store nicknameStore, perms snapshots, publisher NicknamePublisher) *Nicknames {
	return &Nicknames{store: store, perms: perms, publisher: publisher}
}

// Set troca o apelido de targetID e devolve o que ficou gravado (nil = sem).
func (n *Nicknames) Set(ctx context.Context, serverID, actorID, targetID, raw string) (*string, error) {
	snap, err := n.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(actorID) {
		return nil, permission.ErrNotMember
	}
	perms := snap.Server(actorID)
	if actorID == targetID {
		if !permission.Has(perms, permission.ChangeNickname) {
			return nil, permission.ErrMissingPermission
		}
	} else {
		if !permission.Has(perms, permission.ManageNicknames) {
			return nil, permission.ErrMissingPermission
		}
		if !snap.CanManageNicknameOf(actorID, targetID) {
			return nil, ErrCannotActOn
		}
		if !snap.IsMember(targetID) {
			return nil, ErrMemberNotFound
		}
	}

	nick, err := NormalizeNickname(raw)
	if err != nil {
		return nil, err
	}
	mark := &audit.Mark{ServerID: serverID, ActorID: actorID, Action: audit.MemberNickname}
	found, err := n.store.SetNickname(ctx, serverID, targetID, nick, mark)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrMemberNotFound
	}
	if n.publisher != nil {
		n.publisher.PublishMemberNickname(NicknameEvent{ServerID: serverID, UserID: targetID, Nickname: nick})
	}
	return nick, nil
}
