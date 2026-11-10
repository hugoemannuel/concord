package message

import (
	"context"

	"gin-quickstart/backend/internal/permission"
)

// ForwardRooms: quem pode encaminhar o quê para onde (docs/CARGOS.md). A
// origem precisa ser lida (canal: VIEW_CHANNEL; DM: participante) e o destino
// aceitar a mensagem: canal com SEND_MESSAGES (e ATTACH_FILES se leva
// arquivo); DM pela mesma regra de escrever nela (amizade, bloqueio, bot).
type ForwardRooms struct {
	access RoomAccess
	perms  PermissionChecker
}

func NewForwardRooms(access RoomAccess, perms PermissionChecker) *ForwardRooms {
	return &ForwardRooms{access: access, perms: perms}
}

func (r *ForwardRooms) CanRead(ctx context.Context, origin Room, userID string) error {
	return r.access.CanRead(ctx, origin, userID)
}

func (r *ForwardRooms) CanSend(ctx context.Context, target Room, userID string, withFiles bool) error {
	if target.ChannelID == "" {
		return r.access.CanWrite(ctx, target, userID)
	}
	want := permission.ViewChannel | permission.SendMessages
	if withFiles {
		want |= permission.AttachFiles
	}
	return channelAccess(ctx, r.perms, target.ChannelID, userID, want)
}
