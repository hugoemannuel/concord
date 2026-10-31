package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/accountdeletion"
	"gin-quickstart/backend/internal/appsound"
	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/proposal"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireAccountDeletion: excluir a própria conta (docs/adr/0038) e transferir a
// posse de servidor, que é o que o dono faz antes de excluir.
func (a *app) wireAccountDeletion(passwords *auth.AccountHandler) {
	deletion := accountdeletion.NewService(accountdeletion.NewRepository(a.db))
	a.setDeletionFiles(deletion)
	deletion.OnDeleted(a.afterAccountDeleted)

	serverRepository := server.ServerRepository(a.db)
	serverRepository.SetPermissionCache(a.permissionService)
	ownership := server.NewOwnershipService(serverRepository, a.hub)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		accountdeletion.Routes(api, accountdeletion.NewHandler(passwords, deletion), a.authMiddleware)
		server.OwnershipRoutes(api, server.NewOwnershipHandler(ownership), a.authMiddleware)
	})
}

// setDeletionFiles: as pastas de UPLOADS_DIR de cada tipo de arquivo (as
// mesmas que os domínios abrem em wire_chat, wire_emojis, wire_app_sounds...).
func (a *app) setDeletionFiles(deletion *accountdeletion.Service) {
	dir := func(parts ...string) string { return filepath.Join(append([]string{a.uploadsDir}, parts...)...) }
	profile := dir(user.ProfileMediaDir)
	deletion.SetFiles(accountdeletion.KindProfile, mustStore(profile, "profile media dir"), mustStore(filepath.Join(profile, "static"), "profile media dir"))
	deletion.SetFiles(accountdeletion.KindEntrance, mustStore(filepath.Join(profile, user.EntranceSoundDir), "entrance sounds dir"))
	deletion.SetFiles(accountdeletion.KindAppSound, mustStore(filepath.Join(profile, appsound.FilesDir), "app sounds dir"))
	deletion.SetFiles(accountdeletion.KindSoundboard, mustStore(dir("soundboard"), "soundboard uploads dir"))
	deletion.SetFiles(accountdeletion.KindSticker, mustStore(dir("stickers"), "stickers uploads dir"))
	deletion.SetFiles(accountdeletion.KindEmoji, mustStore(dir("emojis"), "emojis uploads dir"))
	deletion.SetFiles(accountdeletion.KindProposal, mustStore(dir(proposal.ImagesDir), "proposal images dir"))
}

// afterAccountDeleted: os servidores apagados somem dos apps, os outros veem a
// saída do membro, o cache de permissões esquece e as conexões da conta caem.
func (a *app) afterAccountDeleted(userID string, e *accountdeletion.Erasure) {
	for _, id := range e.DeletedServers {
		a.permissionService.InvalidateServer(id)
		a.hub.PublishServerDelete(server.DeleteEvent{ServerID: id})
	}
	for _, id := range e.LeftServers {
		a.permissionService.InvalidateServer(id)
		a.hub.PublishMemberLeave(server.MemberLeaveEvent{ServerID: id, UserID: userID})
	}
	a.hub.DisconnectUser(userID)
}
