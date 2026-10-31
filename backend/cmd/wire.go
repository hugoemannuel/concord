package main

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/guest"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/music"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/livekit"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/platform/websocket"
	"gin-quickstart/backend/internal/push"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/soundboard"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// app é a raiz de composição: o que uma área monta e outra usa. Cada
// wire*.go monta uma área (na ordem de main) e registra as rotas dela.
type app struct {
	ctx context.Context
	db  *pgxpool.Pool
	hub *websocket.Hub
	// audit: ponto único de gravação do registro de auditoria dos servidores.
	audit           *audit.Recorder
	auditRepository *audit.Repository
	// Conexões do app do celular (push): o desktop aberto na mesma conta não impede o push.
	mobileApps *websocket.MobileApps

	authRepository *auth.Repository
	authService    *auth.Service
	authMiddleware gin.HandlerFunc
	// memberOrGuest: rotas da call, que o visitante sem conta também usa.
	memberOrGuest   gin.HandlerFunc
	requireVerified gin.HandlerFunc

	userRepository *user.Repository
	userService    *user.Service
	profileHandler *user.ProfileHandler

	permissionService *permission.Service
	roleRepository    *role.Repository
	roleService       *role.Service

	serverService     *server.Service
	moderationService *server.Moderation
	nicknameService   *server.Nicknames

	friendshipService *friendship.Service
	// friendAccepted: amizade aceita reavalia o badge Amigos (wireEngagement).
	friendAccepted *friendship.AcceptHook
	// pushTap liga os publicadores ao notificador de push (wirePush) depois que ele existe.
	pushTap *push.Tap
	// pushNotifier/pushRepo/pushEnabled: o que wirePushCalls usa para ligar a chamada de DM ao push.
	pushNotifier           *push.Notifier
	pushRepo               *push.Repository
	pushEnabled            bool
	channelRepository      *channel.Repository
	channelService         *channel.Service
	conversationRepository *conversation.Repository
	conversationService    *conversation.Service

	uploadsDir           string
	uploadSpace          *media.Space
	messageService       *message.Service
	messageHandler       *message.Handler
	roomAccess           *message.ServiceRoomAccess
	soundboardRepository *soundboard.Repository

	liveKitTokens *livekit.TokenIssuer
	liveKitAdmin  *livekit.Admin
	liveKitPort   string
	callService   *call.Service
	// callAFK: o tempo de call (XP e badges) visto sem quem está 10 min sem falar.
	callAFK *call.AFK
	// callPresence: tira da call quem não está na sala de mídia (#374).
	callPresence *call.MediaPresence
	musicManager *music.Manager
	// guestService: convite de visitante para uma call.
	guestService *guest.Service

	// badgeDone fecha quando os badges, o nível do servidor e o Maestro
	// terminam de gravar no desligamento.
	badgeDone chan struct{}

	routes []func(router *gin.Engine, api *gin.RouterGroup)
}

// route guarda o registro de rotas de uma área para depois do wiring.
func (a *app) route(register func(router *gin.Engine, api *gin.RouterGroup)) {
	a.routes = append(a.routes, register)
}

func (a *app) registerRoutes(router *gin.Engine) {
	api := router.Group("/api")
	for _, register := range a.routes {
		register(router, api)
	}
}

// mustStore abre uma pasta de mídia ou derruba o boot.
func mustStore(dir, what string) *media.Store {
	store, err := media.NewStore(dir)
	if err != nil {
		log.Fatalf("failed to open %s: %v", what, err)
	}
	return store
}

// wire monta todas as áreas na ordem em que uma depende da outra.
func wire(ctx context.Context, db *pgxpool.Pool) *app {
	a := &app{ctx: ctx, db: db, pushTap: push.NewTap()}
	a.auditRepository = audit.NewRepository(db)
	a.audit = audit.NewRecorder(a.auditRepository)
	a.wireCore()
	a.wireAudit()
	a.wireChat()
	a.wirePush()
	a.wireCalls()
	a.wirePushCalls()
	a.wireGuests()
	a.wireMusic()
	a.wireEngagement()
	a.wireEvents()
	a.wireServerLevel()
	a.wireMusicSessions()
	a.wireRealtime()
	a.wireAccount()
	a.wireUpdates()
	a.wireLiveObs()
	return a
}
