package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/badge"
	"gin-quickstart/backend/internal/birthday"
	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/changelog"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/clientip"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/database"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/health"
	"gin-quickstart/backend/internal/httplog"
	"gin-quickstart/backend/internal/level"
	"gin-quickstart/backend/internal/lifecycle"
	"gin-quickstart/backend/internal/livekit"
	"gin-quickstart/backend/internal/media"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/music"
	"gin-quickstart/backend/internal/notifysettings"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/proposal"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/soundboard"
	"gin-quickstart/backend/internal/updates"
	"gin-quickstart/backend/internal/user"
	"gin-quickstart/backend/internal/websocket"

	"gin-quickstart/backend/internal/mailer"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func loadEnv() {
	candidates := []string{".env", "../.env", "../../.env", "backend/.env"}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			if err := godotenv.Load(path); err != nil {
				log.Printf("failed to load %s: %v", path, err)
			}
			return
		}
	}
	log.Println("No .env file found")
}

// newIssueCreator escolhe como as propostas aprovadas viram issue: como um
// GitHub App (GITHUB_APP_*, as issues saem como "<app>[bot]") ou com um token
// fixo (GITHUB_TOKEN). Sem repositório ou sem credencial, devolve nil e as
// propostas aprovadas ficam sem issue.
func newIssueCreator() proposal.IssueCreator {
	creator := buildIssueCreator()
	// GITHUB_API_URL: GitHub Enterprise ou servidor de teste (padrão api.github.com).
	if apiURL := os.Getenv("GITHUB_API_URL"); apiURL != "" {
		if client, ok := creator.(*proposal.GitHubClient); ok {
			log.Printf("[proposal] API do GitHub em %s", apiURL)
			creator = client.WithBaseURL(apiURL)
		}
	}
	// API_PUBLIC_URL: endereço público do backend; com ele as imagens das
	// propostas entram na issue (o GitHub precisa conseguir buscá-las).
	if publicURL := os.Getenv("API_PUBLIC_URL"); publicURL != "" {
		if client, ok := creator.(*proposal.GitHubClient); ok {
			client.WithPublicURL(publicURL)
		}
	}
	return creator
}

func buildIssueCreator() proposal.IssueCreator {
	repo := os.Getenv("GITHUB_REPO")
	if repo == "" {
		log.Println("[proposal] GITHUB_REPO vazio: propostas aprovadas ficam sem issue")
		return nil
	}
	appID, installationID := os.Getenv("GITHUB_APP_ID"), os.Getenv("GITHUB_APP_INSTALLATION_ID")
	if keyPath := os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH"); appID != "" && installationID != "" && keyPath != "" {
		pemKey, err := os.ReadFile(keyPath)
		if err != nil {
			log.Printf("[proposal] GitHub App: não consegui ler a chave %s: %v (propostas aprovadas ficam sem issue)", keyPath, err)
			return nil
		}
		client, err := proposal.NewGitHubAppClient(appID, installationID, pemKey, repo)
		if err != nil {
			log.Printf("[proposal] %v (propostas aprovadas ficam sem issue)", err)
			return nil
		}
		log.Printf("[proposal] issues em %s como GitHub App %s", repo, appID)
		return client
	}
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		log.Printf("[proposal] issues em %s com GITHUB_TOKEN", repo)
		return proposal.NewGitHubClient(token, repo)
	}
	log.Println("[proposal] sem GITHUB_APP_* nem GITHUB_TOKEN: propostas aprovadas ficam sem issue")
	return nil
}

func findMigrationsDir() string {
	// O deploy aplica as migrations novas de uma pasta à parte antes de
	// trocá-las pelas do binário no ar (scripts/deploy-vps.sh).
	if dir := os.Getenv("MIGRATIONS_DIR"); dir != "" {
		return dir
	}
	candidates := []string{"migrations", "../migrations", "../../migrations", "backend/migrations"}
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			return path
		}
	}
	return "migrations"
}

// Desligamento (SIGTERM): o processo novo só sobe depois que este sai, então
// cada espera aqui é tempo sem servidor.
const (
	// Requisições comuns em andamento (API, uploads) têm até isso para acabar;
	// o que sobrar é cortado. O TimeoutStopSec do systemd é bem maior.
	shutdownTimeout = 3 * time.Second
	// O 1012 sai na hora; isso é só o quanto se espera o "ok" de cada app
	// (um notebook que dormiu nunca responde).
	wsCloseTimeout = 500 * time.Millisecond
)

// isLongDownload: respostas que o desligamento corta na hora em vez de
// esperar (download de atualização, vídeo/áudio do chat). Quem baixa retoma
// com Range.
func isLongDownload(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	p := r.URL.Path
	return strings.HasPrefix(p, "/updates/") ||
		(strings.HasPrefix(p, "/api/media/") && p != "/api/media/token")
}

// restoreCalls repete RestoreActive até dar certo ou passar `wait`.
func restoreCalls(ctx context.Context, calls interface {
	RestoreActive(context.Context) error
}, wait time.Duration) error {
	deadline := time.Now().Add(wait)
	for {
		err := calls.RestoreActive(ctx)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return err
		}
		log.Printf("[call] restore falhou (%v); tentando de novo", err)
		select {
		case <-time.After(time.Second):
		case <-ctx.Done():
			return err
		}
	}
}

func main() {
	// `concord-server capabilities`: o que este binário sabe fazer, sem tocar
	// em banco nem porta. O deploy procura a marca no arquivo (sem executá-lo)
	// para não instalar, com o socket do systemd ativo, um binário que não sabe
	// usá-lo.
	if len(os.Args) > 1 && os.Args[1] == "capabilities" {
		fmt.Println(lifecycle.SocketActivationCapability)
		return
	}

	loadEnv()

	// SIGTERM (systemctl restart/stop) ou Ctrl+C: desliga com calma (ver lifecycle.Run).
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()
	// Salinha Servidor (internal/hostkit): no Windows não há SIGTERM para um
	// processo sem console, então o supervisor pede o desligamento com calma
	// fechando o stdin (e, se ele morrer, o stdin fecha sozinho).
	if os.Getenv("STOP_ON_STDIN_EOF") == "1" {
		go func() {
			_, _ = io.Copy(io.Discard, os.Stdin)
			stop()
		}()
	}

	databaseURL := os.Getenv("DATABASE_URL")

	// Depois de um boot da VPS o Postgres pode subir depois do backend.
	db, err := database.ConnectWithRetry(databaseURL, 30*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := database.Migrate(db, findMigrationsDir()); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	// `concord-server migrate`: só aplica as migrations e sai. O deploy roda
	// assim com o binário antigo ainda no ar; se falhar, nada é reiniciado.
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		log.Println("migrations aplicadas")
		return
	}

	// Como o gin.Default(), mas o log não grava tokens que vão na URL.
	router := gin.New()
	// Em quem confiar para o IP do cliente (log e limite de login).
	trustedProxies := clientip.TrustedProxies(os.Getenv("HOST"), os.Getenv("TRUSTED_PROXIES"))
	if err := clientip.Configure(router, trustedProxies); err != nil {
		log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
	}
	log.Printf("trusted proxies: %v", trustedProxies)
	// O deploy e o apply-caddyfile consultam /healthz em laço: fora do log.
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: httplog.Formatter, SkipPaths: []string{"/healthz"}}), gin.Recovery())

	// Downloads longos não seguram o desligamento (ver isLongDownload).
	streams := lifecycle.NewStreams()
	streamsMiddleware := streams.Gin()
	router.Use(func(c *gin.Context) {
		if isLongDownload(c.Request) {
			streamsMiddleware(c)
			return
		}
		c.Next()
	})

	// Pronto só depois de recarregar as chamadas (ver SetReady abaixo).
	readiness := health.New(db.Ping)
	router.GET("/healthz", readiness.Handler)

	router.Use(cors.New(cors.Config{
		// O app empacotado carrega via file:// e a auth é por Bearer (sem
		// cookies), então qualquer origem pode chamar a API.
		AllowOriginFunc:  func(string) bool { return true },
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Auth
	authRepository := auth.AuthRepository(db)
	authService := auth.AuthService(authRepository)

	// User
	userRepository := user.UserRepository(db)
	userService := user.UserService(userRepository)
	// A migration 000025 não falha com usernames que só diferem na caixa:
	// cai num índice comum. Aqui isso aparece no log (só contagens).
	// E se a 000025 nem rodou (pulada por ordem de aplicação), ERROR no log.
	if hasUsername, hasEmail, err := userService.LoginIndexes(context.Background()); err != nil {
		log.Printf("[user] check login indexes: %v", err)
	} else if msg := user.MissingLoginIndexesError(hasUsername, hasEmail); msg != "" {
		log.Print(msg)
	}
	if usernameGroups, emailGroups, err := userService.CaseConflicts(context.Background()); err != nil {
		log.Printf("[user] check case conflicts: %v", err)
	} else if warning := user.CaseConflictWarning(usernameGroups, emailGroups); warning != "" {
		log.Print(warning)
	}

	// WebSocket hub (created before services that publish events)
	hub := websocket.NewHub()
	hub.SetStatusLookup(userRepository.GetStatus)
	hub.SetAudience(websocket.NewSQLAudience(db))

	// Permissões (cargos, @everyone, sobrescritas por canal)
	permissionRepository := permission.PermissionRepository(db)
	permissionService := permission.PermissionService(permissionRepository)
	hub.SetVisibility(permissionService)

	// Cargos
	roleRepository := role.RoleRepository(db)
	roleService := role.RoleService(roleRepository, permissionService, hub)
	roleHandler := role.RoleHandler(roleService)

	// Server
	serverRepository := server.ServerRepository(db)
	serverService := server.ServerService(serverRepository, hub, roleRepository)
	// Online na prévia do link de convite (invisível conta como offline).
	serverService.SetPresence(hub.PresenceMap)
	moderationService := server.ModerationService(serverRepository, permissionService, hub)
	nicknameService := server.NicknameService(serverRepository, permissionService, hub)

	// Friendship
	friendshipRepository := friendship.FriendshipRepository(db)
	friendshipService := friendship.FriendshipService(friendshipRepository, userService, hub)
	friendshipHandler := friendship.FriendshipHandler(friendshipService)

	// Channel
	channelRepository := channel.ChannelRepository(db)
	channelService := channel.ChannelService(channelRepository, hub)
	channelHandler := channel.ChannelHandler(channelService, permissionService)

	// Conversation (DM)
	conversationRepository := conversation.ConversationRepository(db)
	conversationService := conversation.ConversationService(conversationRepository)
	conversationService.SetDependencies(friendshipService, hub)
	friendshipService.SetServers(serverService, func(ctx context.Context, a, b string) (any, error) {
		return serverService.MutualServers(ctx, a, b)
	})

	// Mídia do chat (arquivos no disco, fora do binário e do deploy)
	uploadsDir := os.Getenv("UPLOADS_DIR")
	if uploadsDir == "" {
		uploadsDir = "uploads"
	}
	uploads, err := media.NewStore(uploadsDir)
	if err != nil {
		log.Fatalf("failed to open uploads dir: %v", err)
	}

	// Message
	messageRepository := message.MessageRepository(db)
	messageService := message.MessageService(messageRepository, hub, channelRepository, conversationRepository, uploads, permissionService)
	// Limpeza horária de arquivos sem dono (cascatas e uploads abandonados).
	go message.NewJanitor(messageRepository, uploads).Run(ctx, time.Hour)
	messageHandler := message.MessageHandler(messageService, channelService, conversationService, friendshipService, permissionService)
	uploadSpace := media.NewSpace(uploadsDir, media.ReserveFromEnv(os.Getenv("UPLOADS_MIN_FREE_GB")))
	roomAccess := message.NewServiceRoomAccess(channelService, permissionService, conversationService, friendshipService)
	attachmentHandler := message.NewAttachmentHandler(messageRepository, uploads, uploadSpace, roomAccess, authService)

	// Boas-vindas no canal "avisos" para todo usuário novo no servidor.
	serverService.OnMemberJoined(func(ctx context.Context, serverID string, member server.ServerMember) {
		if member.Username == "" {
			return
		}
		ch, err := channelService.NoticesChannel(ctx, serverID)
		if err != nil {
			log.Printf("[server] canal de avisos do servidor %s: %v", serverID, err)
			return
		}
		content := server.RandomWelcomeMessage(member.Username)
		if _, err := messageService.CreateSystemChannelMessage(ctx, ch.ID, member.UserID, content, server.WelcomeSystemKind); err != nil {
			log.Printf("[server] mensagem de boas-vindas no servidor %s: %v", serverID, err)
		}
	})

	// Mesa de áudio (Soundboard) compartilhada por servidor
	soundboardUploads, err := media.NewStore(filepath.Join(uploadsDir, "soundboard"))
	if err != nil {
		log.Fatalf("failed to open soundboard uploads dir: %v", err)
	}
	soundboardRepository := soundboard.NewRepository(db)
	soundboardHandler := soundboard.NewHandler(soundboardRepository, soundboardUploads, uploadSpace, serverService, permissionService, authService, hub)

	// Perfil (avatar/banner numa subpasta que a limpeza dos anexos não varre)
	profileMediaDir := filepath.Join(uploadsDir, user.ProfileMediaDir)
	profileMedia, err := media.NewStore(profileMediaDir)
	if err != nil {
		log.Fatalf("failed to open profile media dir: %v", err)
	}
	profileStatic, err := media.NewStore(filepath.Join(profileMediaDir, "static"))
	if err != nil {
		log.Fatalf("failed to open profile media dir: %v", err)
	}
	profileService := user.NewProfileService(userRepository, hub)
	profileHandler := user.NewProfileHandler(profileService, profileMedia, profileStatic, uploadSpace)
	conversationHandler := conversation.ConversationHandler(conversationService, userService, profileHandler)
	// O ícone do servidor usa o mesmo upload do avatar.
	serverHandler := server.ServerHandler(serverService, friendshipService, userService, channelService, permissionService, roleService, moderationService, nicknameService, profileHandler)

	// LiveKit (mídia das chamadas)
	liveKitKey, liveKitSecret := os.Getenv("LIVEKIT_API_KEY"), os.Getenv("LIVEKIT_API_SECRET")
	if liveKitKey == "" || liveKitSecret == "" {
		log.Fatal("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set")
	}
	liveKitTokens := livekit.NewTokenIssuer(liveKitKey, liveKitSecret)
	liveKitPort := os.Getenv("LIVEKIT_PORT")
	if liveKitPort == "" {
		liveKitPort = "7880"
	}
	rtcProxy, err := livekit.NewRTCProxy("http://127.0.0.1:" + liveKitPort)
	if err != nil {
		log.Fatalf("invalid LiveKit address: %v", err)
	}

	// Call (ciclo de vida da chamada; mídia via LiveKit)
	callRepository := call.CallRepository(db)
	callService := call.CallService(callRepository, hub, conversationService, serverService, channelService, userService, hub.IsOnline)
	callService.SetSoundLookup(soundboard.NewCallLookup(soundboardRepository))
	callService.SetPermissions(permissionService)
	callService.SetMediaAdmin(livekit.NewAdmin("http://127.0.0.1:"+liveKitPort, liveKitKey, liveKitSecret))
	// Mudou cargo ou canal: quem está em voz sem acesso sai; quem perdeu falar
	// ou transmitir tem a mídia atualizada na hora.
	hub.SetPermissionsChangedHook(func(serverID string) {
		callService.RevalidateServer(context.Background(), serverID)
	})
	// Expulso, banido ou saiu do servidor: sai da chamada de voz dele.
	moderationService.SetOnRemoved(callService.RemoveFromServerCalls)
	callService.SetBlockedCheck(friendshipService.IsBlockedEither)
	callHandler := call.CallHandler(callService, liveKitTokens)
	// Reinício do servidor não derruba quem está em chamada. Sem conseguir
	// recarregar as chamadas o servidor não fica pronto (a porta nem abre):
	// tenta de novo por até 30 s e então desiste (o systemd reinicia e o
	// deploy volta ao binário anterior).
	if err := restoreCalls(ctx, callService, 30*time.Second); err != nil {
		log.Fatalf("não foi possível recarregar as chamadas: %v", err)
	}

	// Maestro (bot de música): um player LiveKit por canal de voz.
	musicManager := music.NewManager(music.ConfigFromEnv(liveKitPort), music.ManagerDeps{
		Locate: func(userID string) (music.Location, bool) {
			l, ok := callService.VoiceLocationOf(userID)
			return music.Location{CallID: l.CallID, ChannelID: l.ChannelID, ServerID: l.ServerID}, ok
		},
		Humans: callService.ParticipantIDs,
		IsMember: func(ctx context.Context, serverID, userID string) bool {
			ok, err := serverService.IsMember(ctx, serverID, userID)
			return err == nil && ok
		},
		BotEnabled: func(ctx context.Context, serverID string) bool {
			ok, err := serverService.IsMember(ctx, serverID, bot.UserID)
			return err == nil && ok
		},
		ChannelName: func(ctx context.Context, channelID string) string {
			ch, err := channelService.FindByID(ctx, channelID)
			if err != nil {
				return ""
			}
			return ch.Name
		},
		User: func(ctx context.Context, userID string) (music.UserRef, error) {
			u, err := userService.FindByID(ctx, userID)
			if err != nil {
				return music.UserRef{}, err
			}
			return music.UserRef{ID: u.ID, Username: u.Username, DisplayName: u.DisplayName, AvatarURL: u.AvatarURL}, nil
		},
		PostPublic: func(ctx context.Context, textChannelID, content string) error {
			// As mensagens públicas do Maestro saem no canal "bot" do servidor;
			// sem ele (não deveria ocorrer) ficam no canal onde o comando foi dado.
			if origin, err := channelService.FindByID(ctx, textChannelID); err == nil {
				if sys, err := channelService.SystemChannel(ctx, origin.ServerID); err == nil {
					textChannelID = sys.ID
				}
			}
			_, err := messageService.CreateSystemChannelMessage(ctx, textChannelID, bot.UserID, content, music.SystemKind)
			return err
		},
		SendToUser:      hub.SendToUser,
		BroadcastToCall: hub.BroadcastToCall,
		BroadcastToRoom: hub.BroadcastToRoom,
		Tokens:          liveKitTokens,
	})
	callService.OnParticipantLeft(musicManager.OnParticipantLeft)
	callService.OnCallEnded(musicManager.OnCallEnded)
	serverService.OnMusicBotDisabled(musicManager.CloseServer)
	messageHandler.SetCommandHandler(musicManager)

	// Aniversários (mensagem do servidor às 9h + modal para o aniversariante)
	birthdayRepository := birthday.BirthdayRepository(db)
	birthdayService := birthday.BirthdayService(birthdayRepository, messageService)
	birthdayHandler := birthday.BirthdayHandler(birthdayService)
	go birthdayService.Run(context.Background())

	// Level (XP por tempo em call, sem mute)
	levelRepository := level.LevelRepository(db)
	levelService := level.LevelService(levelRepository, hub, callService)
	levelHandler := level.LevelHandler(levelService)
	go levelService.Run(ctx)

	// Propostas (kanban com votação de 7 dias; aprovadas viram issue no GitHub)
	issueCreator := newIssueCreator()
	var techIDs []string
	for id := range strings.SplitSeq(os.Getenv("TECH_TEAM_USER_IDS"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			techIDs = append(techIDs, id)
		}
	}
	// Imagens das propostas numa subpasta que a limpeza dos anexos não varre.
	proposalImages, err := media.NewStore(filepath.Join(uploadsDir, proposal.ImagesDir))
	if err != nil {
		log.Fatalf("failed to open proposal images dir: %v", err)
	}
	proposalService := proposal.ProposalService(proposal.ProposalRepository(db), hub, issueCreator, proposalImages, techIDs)
	proposalHandler := proposal.ProposalHandler(proposalService, proposalImages, uploadSpace)
	go proposalService.Run(ctx)

	// Badges do perfil (tempo transmitindo, madrugada, maior call... somados
	// olhando as chamadas; o resto vem dos contadores do banco)
	// Horas de Coruja/Madrugador em Brasília (nil), não no relógio da VPS. No
	// desligamento grava o que estava na memória antes de fechar o banco.
	badgeService := badge.BadgeService(badge.BadgeRepository(db), hub, callService, hub, nil)
	badgeHandler := badge.BadgeHandler(badgeService)
	notifySettingsHandler := notifysettings.NotifySettingsHandler(
		notifysettings.NotifySettingsService(notifysettings.NotifySettingsRepository(db), permissionService, hub),
	)
	badgeDone := make(chan struct{})
	go func() {
		defer close(badgeDone)
		badgeService.Run(ctx)
	}()

	// WebSocket handler
	// "Fulano está digitando…": mesma regra de escrita das mensagens.
	typing := websocket.NewTyping(hub, roomAccess, userService.FindByID)
	wsHandler := websocket.WsHandler(hub, authService, permissionService, serverService, conversationService, callService, typing)
	hub.SetDisconnectHandler(callService.HandleDisconnect)

	// Auth middleware
	authMiddleware := auth.AuthMiddleware(authService)

	api := router.Group("/api")

	// Auth routes (public)
	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "http://localhost:5173"
	}
	emailService := auth.NewEmailService(authRepository, userService, authService, mailer.FromEnv(), appURL)
	// Servidor sem SMTP (instalador do host): ninguém receberia o link, então a
	// conta já nasce confirmada e o RequireVerified deixa passar.
	emailVerificationOff := strings.EqualFold(strings.TrimSpace(os.Getenv("EMAIL_VERIFICATION")), "off")
	if emailVerificationOff {
		emailService.WithAutoVerify()
		log.Println("confirmação de e-mail desligada (EMAIL_VERIFICATION=off)")
	}
	authHandler := auth.AuthHandler(authService, userService).WithEmail(emailService)
	auth.AuthRoutes(api, authHandler, authMiddleware)

	// Protected routes
	userHandler := user.UserHandler(userService)
	user.UserRoutes(api, userHandler, authMiddleware)
	user.ProfileRoutes(api, profileHandler, authMiddleware)
	friendship.FriendRoutes(api, friendshipHandler, authMiddleware)
	requireVerified := auth.RequireVerified(func(ctx context.Context, id string) (bool, error) {
		if emailVerificationOff {
			return true, nil
		}
		u, err := userService.FindByID(ctx, id)
		if err != nil {
			return false, err
		}
		return u.EmailVerifiedAt != nil, nil
	})
	server.ServerRoutes(api, serverHandler, authMiddleware, requireVerified, auth.OptionalAuthMiddleware(authService))
	channel.ChannelRoutes(api, channelHandler, authMiddleware)
	role.RoleRoutes(api, roleHandler, authMiddleware)
	conversation.ConversationRoutes(api, conversationHandler, authMiddleware)
	message.MessageRoutes(api, messageHandler, authMiddleware)
	message.AttachmentRoutes(api, attachmentHandler, authMiddleware)
	call.CallRoutes(api, callHandler, authMiddleware)
	soundboard.Routes(api, soundboardHandler, authMiddleware)
	level.LevelRoutes(api, levelHandler, authMiddleware)
	badge.BadgeRoutes(api, badgeHandler, authMiddleware)
	notifysettings.Routes(api, notifySettingsHandler, authMiddleware)
	proposal.ProposalRoutes(api, proposalHandler, authMiddleware, requireVerified)
	birthday.BirthdayRoutes(api, birthdayHandler, authMiddleware)
	changelog.Routes(api, changelog.NewHandler(changelog.NewRepository(db), os.Getenv("CHANGELOG_TOKEN")), authMiddleware)
	music.Routes(api, music.NewHandler(musicManager, authService), authMiddleware)

	// Presence (protected)
	presence := api.Group("/presence")
	presence.Use(authMiddleware)
	{
		presence.GET("", wsHandler.Presence)
		presence.GET("/", wsHandler.Presence)
		presence.GET("/activities", wsHandler.Activities)
	}

	// WebSocket endpoint (public, auth via ?token=)
	router.GET("/ws", wsHandler.ServeWS)

	// Atualizações do app (scripts/release-win.sh publica nesta pasta)
	updatesDir := os.Getenv("UPDATES_DIR")
	if updatesDir == "" {
		updatesDir = "updates"
	}
	updates.Routes(router, updatesDir)
	// Versão nova publicada: avisa os apps na hora (sem esperar a checagem periódica).
	go updates.NewWatcher(updatesDir, func(r updates.Release) {
		log.Printf("[updates] nova versão em %s: %s", r.File, r.Version)
		hub.PublishAppUpdate(r.File, r.Version)
	}).Run(context.Background(), updates.PollInterval)

	// Sinalização do LiveKit (auth pelo token do LiveKit em ?access_token=)
	router.Any("/rtc", rtcProxy)
	router.Any("/rtc/*path", rtcProxy)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// HOST=127.0.0.1 quando há um proxy na frente (Caddy na VPS). Com o
	// socket do systemd (deploy/concord-server.socket) a porta fica aberta
	// durante o reinício e as conexões esperam na fila; sem ele, a porta só
	// abre com tudo pronto. Nos dois casos nada é atendido antes de pronto.
	ln, activated, err := lifecycle.Listen(os.Getenv("HOST") + ":" + port)
	if err != nil {
		log.Fatal(err)
	}
	readiness.SetReady()
	if activated {
		log.Printf("servidor pronto em %s (socket do systemd)", ln.Addr())
	} else {
		log.Printf("servidor pronto em %s", ln.Addr())
	}

	srv := &http.Server{Handler: router, ReadHeaderTimeout: 10 * time.Second}
	err = lifecycle.Run(ctx, srv, ln, shutdownTimeout, func(ctx context.Context) {
		stop() // um segundo SIGTERM/Ctrl+C mata na hora
		readiness.SetStopping()
		streams.Interrupt()
		// Não tira ninguém das chamadas: o processo novo as recarrega do banco
		// e os clientes reconectam com o código 1012.
		wsCtx, cancel := context.WithTimeout(ctx, wsCloseTimeout)
		defer cancel()
		hub.Shutdown(wsCtx)
	})
	if err != nil && !errors.Is(err, context.DeadlineExceeded) {
		log.Fatal(err)
	}
	if err != nil {
		log.Printf("desligamento: requisições ainda em andamento após %s foram cortadas", shutdownTimeout)
	}
	// Os badges gravam o último minuto e as maratonas em andamento (o ctx já
	// foi cancelado pelo SIGTERM); o db.Close do defer vem depois.
	select {
	case <-badgeDone:
	case <-time.After(5 * time.Second):
		log.Println("desligamento: badges não terminaram de gravar a tempo")
	}
	log.Println("servidor desligado")
}
