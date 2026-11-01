package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/giphy"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/push"
	"gin-quickstart/backend/internal/relationship"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/soundboard"
	"gin-quickstart/backend/internal/sticker"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireChat: mensagens, anexos, busca, soundboard, figurinhas, GIFs e perfil
// (tudo que grava arquivo em UPLOADS_DIR).
func (a *app) wireChat() {
	// Mídia do chat (arquivos no disco, fora do binário e do deploy)
	a.uploadsDir = envOr("UPLOADS_DIR", "uploads")
	uploads := mustStore(a.uploadsDir, "uploads dir")

	messageRepository := message.MessageRepository(a.db)
	a.messageService = message.MessageService(messageRepository, push.WrapMessages(a.hub, a.pushTap), a.cachedChannels(), a.conversationRepository, uploads, a.permissionService)
	a.messageService.SetAudit(a.audit)
	// Limpeza horária de arquivos sem dono (cascatas e uploads abandonados).
	go message.NewJanitor(messageRepository, uploads).Run(a.ctx, time.Hour)
	a.messageHandler = message.MessageHandler(a.messageService, a.channelService, a.conversationService, a.friendshipService, a.permissionService)
	a.uploadSpace = media.NewSpace(a.uploadsDir, media.ReserveFromEnv(os.Getenv("UPLOADS_MIN_FREE_GB")))
	a.roomAccess = message.NewServiceRoomAccess(a.channelService, a.permissionService, a.conversationService, a.friendshipService)
	attachmentHandler := message.NewAttachmentHandler(messageRepository, uploads, a.uploadSpace, a.roomAccess, a.authService)
	searchHandler := message.NewSearchHandler(messageRepository, a.permissionService, a.roomAccess)
	a.wireTTS(messageRepository)
	a.wireEmojis()

	a.serverService.OnMemberJoined(func(ctx context.Context, serverID string, member server.ServerMember) {
		welcomeMember(ctx, a.channelService, a.messageService, serverID, member)
	})

	// Mesa de áudio (Soundboard) compartilhada por servidor
	soundboardUploads := mustStore(filepath.Join(a.uploadsDir, "soundboard"), "soundboard uploads dir")
	a.soundboardRepository = soundboard.NewRepository(a.db)
	soundboardHandler := soundboard.NewHandler(a.soundboardRepository, soundboardUploads, a.uploadSpace, a.permissionService, a.permissionService, a.authService, a.hub)
	soundboardHandler.SetAudit(a.audit)
	soundboardHandler.SetVisitors(appVisitors{a})

	// Figurinhas (Stickers) compartilhadas por servidor
	stickersUploads := mustStore(filepath.Join(a.uploadsDir, "stickers"), "stickers uploads dir")
	stickerRepository := sticker.NewRepository(a.db)
	stickerHandler := sticker.NewHandler(stickerRepository, stickersUploads, a.uploadSpace, a.permissionService, a.permissionService, a.authService, a.hub)
	stickerHandler.SetAudit(a.audit)
	a.messageService.SetStickerChecker(stickerRepository)

	giphyHandler := giphy.NewHandler(os.Getenv("GIPHY_API_KEY"))

	// Perfil (avatar/banner numa subpasta que a limpeza dos anexos não varre)
	profileMediaDir := filepath.Join(a.uploadsDir, user.ProfileMediaDir)
	profileMedia := mustStore(profileMediaDir, "profile media dir")
	profileStatic := mustStore(filepath.Join(profileMediaDir, "static"), "profile media dir")
	profileService := user.NewProfileService(a.userRepository, a.hub, relationship.NewRepository(a.db))
	a.profileHandler = user.NewProfileHandler(profileService, profileMedia, profileStatic, a.uploadSpace)
	a.wireSavedProfiles(profileService)
	a.wireAppSounds()
	a.wireAppThemes()
	entranceSounds := mustStore(filepath.Join(profileMediaDir, user.EntranceSoundDir), "entrance sounds dir")
	entranceSoundHandler := user.NewEntranceSoundHandler(profileService, entranceSounds, a.uploadSpace)
	conversationHandler := conversation.ConversationHandler(a.conversationService, a.userService, a.profileHandler)
	// O ícone do servidor usa o mesmo upload do avatar.
	serverHandler := server.ServerHandler(a.serverService, a.friendshipService, a.userService, a.channelService, a.permissionService, a.roleService, a.moderationService, a.nicknameService, a.profileHandler)
	serverHandler.SetAudit(a.audit)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		user.ProfileRoutes(api, a.profileHandler, a.authMiddleware)
		user.EntranceSoundRoutes(api, entranceSoundHandler, a.authMiddleware)
		server.ServerRoutes(api, serverHandler, a.authMiddleware, a.requireVerified, auth.OptionalAuthMiddleware(a.authService))
		conversation.ConversationRoutes(api, conversationHandler, a.authMiddleware)
		message.MessageRoutes(api, a.messageHandler, a.authMiddleware)
		message.AttachmentRoutes(api, attachmentHandler, a.authMiddleware)
		message.SearchRoutes(api, searchHandler, a.authMiddleware)
		soundboard.Routes(api, soundboardHandler, a.authMiddleware)
		soundboard.FavoriteRoutes(api, soundboard.NewFavoritesHandler(a.soundboardRepository, a.soundboardRepository, a.permissionService), a.authMiddleware)
		sticker.Routes(api, stickerHandler, a.authMiddleware)
		giphy.Routes(api, giphyHandler, a.authMiddleware)
		giphy.FavoriteRoutes(api, giphy.NewFavoritesHandler(giphy.NewFavoriteRepository(a.db)), a.authMiddleware)
	})
}

// noticesFinder e systemPoster: o que welcomeMember usa dos serviços de canal e mensagem.
type noticesFinder interface {
	NoticesChannel(ctx context.Context, serverID string) (*channel.Channel, error)
}

type systemPoster interface {
	CreateSystemChannelMessage(ctx context.Context, channelID, authorID, content, kind string) (*message.Message, error)
}

// welcomeMember: boas-vindas no canal "avisos" para todo usuário novo no servidor.
func welcomeMember(ctx context.Context, notices noticesFinder, poster systemPoster, serverID string, member server.ServerMember) {
	if member.Username == "" {
		return
	}
	ch, err := notices.NoticesChannel(ctx, serverID)
	if err != nil {
		log.Printf("[server] canal de avisos do servidor %s: %v", serverID, err)
		return
	}
	content := server.RandomWelcomeMessage(member.Username)
	if _, err := poster.CreateSystemChannelMessage(ctx, ch.ID, member.UserID, content, server.WelcomeSystemKind); err != nil {
		log.Printf("[server] mensagem de boas-vindas no servidor %s: %v", serverID, err)
	}
}
