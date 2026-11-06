package expression

import (
	"context"

	"gin-quickstart/backend/internal/permission"
)

// UploaderMembers diz se a pessoa é membro do servidor.
type UploaderMembers interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

// UploaderPerms devolve as permissões da pessoa no servidor.
type UploaderPerms interface {
	ServerPerms(ctx context.Context, serverID, userID string) (int64, error)
}

// UploaderCounter conta quantos itens o servidor já tem.
type UploaderCounter interface {
	CountByServer(ctx context.Context, serverID string) (int, error)
}

// Uploader é a regra de quem pode adicionar um emoji, figurinha ou som a um
// servidor: ser membro, ter Permission e o servidor ter menos de Max itens.
type Uploader struct {
	Members    UploaderMembers
	Perms      UploaderPerms
	Counter    UploaderCounter
	Permission int64
	Max        int
}

// UploaderErrors é a resposta de cada recusa da checagem; cada domínio dá as
// suas mensagens (como media.UploadErrors).
type UploaderErrors[T any] struct {
	MemberCheck, NotMember, PermsCheck, MissingPermission, CountCheck, Full T
}

// CheckUploader confere, nesta ordem, membro, permissão e vaga no servidor.
// Devolve a resposta da primeira recusa, ou o zero de T (nil para ponteiro)
// quando a pessoa pode enviar.
func CheckUploader[T any](ctx context.Context, u Uploader, serverID, userID string, errs UploaderErrors[T]) T {
	isMember, err := u.Members.IsMember(ctx, serverID, userID)
	if err != nil {
		return errs.MemberCheck
	}
	if !isMember {
		return errs.NotMember
	}
	perms, err := u.Perms.ServerPerms(ctx, serverID, userID)
	if err != nil {
		return errs.PermsCheck
	}
	if !permission.Has(perms, u.Permission) {
		return errs.MissingPermission
	}
	return checkRoom(ctx, u, serverID, errs)
}

// checkRoom: o servidor ainda tem vaga para mais um item?
func checkRoom[T any](ctx context.Context, u Uploader, serverID string, errs UploaderErrors[T]) T {
	count, err := u.Counter.CountByServer(ctx, serverID)
	if err != nil {
		return errs.CountCheck
	}
	if count >= u.Max {
		return errs.Full
	}
	var allowed T
	return allowed
}
