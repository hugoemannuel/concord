package main

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/websocket"
	"gin-quickstart/backend/internal/push"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireCore: sessão, usuários, hub de eventos, permissões, servidores,
// amizades, canais e DMs, que é a base de todas as outras áreas.
func (a *app) wireCore() {
	a.authRepository = auth.AuthRepository(a.db)
	secret, err := auth.SecretFromEnv()
	if err != nil {
		log.Fatalf("[auth] %v", err)
	}
	a.authService = auth.NewService(a.authRepository, secret)
	a.authMiddleware = auth.AuthMiddleware(a.authService)
	a.memberOrGuest = auth.MemberOrGuestMiddleware(a.authService)

	a.userRepository = user.UserRepository(a.db)
	a.userService = user.UserService(a.userRepository)
	checkLoginIndexes(a.userService)
	// Toda rota autenticada passa aqui: o "sim" fica em cache (trocar o e-mail esquece).
	a.requireVerified = auth.RequireVerified(a.userRepository.IsVerified)

	// WebSocket hub (criado antes dos serviços que publicam eventos)
	a.hub = websocket.NewHub()
	a.mobileApps = websocket.NewMobileApps()
	a.hub.SetStatusLookup(a.userRepository.GetStatus)
	a.hub.SetAudience(websocket.NewSQLAudience(a.db))

	// Permissões (cargos, @everyone, sobrescritas por canal)
	a.permissionService = permission.PermissionService(permission.PermissionRepository(a.db))
	a.hub.SetVisibility(a.permissionService)
	// Movimento do cache de permissões no log (acertos, idas ao banco, invalidações).
	go a.permissionService.LogStatsEvery(a.ctx, 10*time.Minute, log.Printf)

	a.roleRepository = role.RoleRepository(a.db)
	a.roleService = role.RoleService(a.roleRepository, a.permissionService, a.hub)
	a.roleService.SetAudit(a.audit)
	roleHandler := role.RoleHandler(a.roleService)

	serverRepository := server.ServerRepository(a.db)
	// Cache de permissões sem TTL: entrar no servidor, sair e apagá-lo invalidam.
	serverRepository.SetPermissionCache(a.permissionService)
	a.serverService = server.ServerService(serverRepository, a.hub, a.roleRepository)
	// Online na prévia do link de convite (invisível conta como offline).
	a.serverService.SetPresence(a.hub.PresenceMap)
	a.serverService.SetAudit(a.audit)
	a.moderationService = server.ModerationService(serverRepository, a.permissionService, a.hub)
	a.moderationService.SetAudit(a.audit)
	a.nicknameService = server.NicknameService(serverRepository, a.permissionService, a.hub)
	a.nicknameService.SetAudit(a.audit)

	a.friendAccepted = friendship.WithAcceptHook(push.WrapFriends(a.hub, a.pushTap))
	a.friendshipService = friendship.FriendshipService(friendship.FriendshipRepository(a.db), a.userService, a.friendAccepted)
	friendshipHandler := friendship.FriendshipHandler(a.friendshipService)

	a.channelRepository = channel.ChannelRepository(a.db)
	a.channelService = channel.ChannelService(a.channelRepository, a.hub)
	a.channelService.SetPermissionCache(a.permissionService)
	channelHandler := channel.ChannelHandler(a.channelService, a.permissionService)
	channelHandler.SetAudit(a.audit)

	a.conversationRepository = conversation.ConversationRepository(a.db)
	a.conversationService = conversation.ConversationService(a.conversationRepository)
	a.conversationService.SetDependencies(a.friendshipService, a.hub)
	a.friendshipService.SetServers(a.serverService, func(ctx context.Context, x, y string) (any, error) {
		return a.serverService.MutualServers(ctx, x, y)
	})

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		user.UserRoutes(api, user.UserHandler(a.userService), a.authMiddleware)
		friendship.FriendRoutes(api, friendshipHandler, a.authMiddleware)
		channel.ChannelRoutes(api, channelHandler, a.authMiddleware)
		role.RoleRoutes(api, roleHandler, a.authMiddleware)
	})
}

// loginIndexChecker é o pedaço do user.Service que o boot confere.
type loginIndexChecker interface {
	LoginIndexes(ctx context.Context) (hasUsername, hasEmail bool, err error)
	CaseConflicts(ctx context.Context) (usernameGroups, emailGroups int, err error)
}

// checkLoginIndexes: a migration 000025 não falha com usernames que só
// diferem na caixa: cai num índice comum. Aqui isso aparece no log (só
// contagens). E se a 000025 nem rodou (pulada por ordem de aplicação), ERROR no log.
func checkLoginIndexes(users loginIndexChecker) {
	if hasUsername, hasEmail, err := users.LoginIndexes(context.Background()); err != nil {
		log.Printf("[user] check login indexes: %v", err)
	} else if msg := user.MissingLoginIndexesError(hasUsername, hasEmail); msg != "" {
		log.Print(msg)
	}
	if usernameGroups, emailGroups, err := users.CaseConflicts(context.Background()); err != nil {
		log.Printf("[user] check case conflicts: %v", err)
	} else if warning := user.CaseConflictWarning(usernameGroups, emailGroups); warning != "" {
		log.Print(warning)
	}
}
