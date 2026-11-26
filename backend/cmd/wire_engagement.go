package main

import (
	"context"
	"path/filepath"

	"gin-quickstart/backend/internal/badge"
	"gin-quickstart/backend/internal/birthday"
	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/enquete"
	"gin-quickstart/backend/internal/level"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/notifysettings"
	"gin-quickstart/backend/internal/proposal"
	"gin-quickstart/backend/internal/relationship"

	"github.com/gin-gonic/gin"
)

// wireEngagement: aniversários, níveis, badges, propostas e preferências de
// notificação, com os jobs de fundo de cada um (changelog: wire_changelog.go).
func (a *app) wireEngagement() {
	// Aniversários (mensagem do servidor às 9h + modal para o aniversariante)
	birthdayService := birthday.BirthdayService(birthday.BirthdayRepository(a.db), a.messageService)
	birthdayHandler := birthday.BirthdayHandler(birthdayService)
	go birthdayService.Run(context.Background())

	// Level (XP por tempo em call, sem mute e sem estar AFK)
	levelRepository := level.LevelRepository(a.db)
	levelService := level.LevelService(levelRepository, a.hub, a.callAFK)
	levelHandler := level.LevelHandler(levelService)
	go levelService.Run(a.ctx)
	rankingHandler := level.LevelRankingHandler(level.RankingServiceFor(levelRepository, relationship.NewRepository(a.db)))

	// Propostas (kanban com votação de 7 dias; aprovadas viram issue no GitHub)
	issueCreator := newIssueCreator()
	techIDs := envList("TECH_TEAM_USER_IDS")
	// Imagens das propostas numa subpasta que a limpeza dos anexos não varre.
	proposalImages := mustStore(filepath.Join(a.uploadsDir, proposal.ImagesDir), "proposal images dir")
	// Badges do perfil (tempo transmitindo, madrugada, maior call... somados
	// olhando as chamadas; o resto vem dos contadores do banco)
	// Horas de Coruja/Madrugador em Brasília (nil), não no relógio da VPS. No
	// desligamento grava o que estava na memória antes de fechar o banco.
	// Tempo em call de quem está AFK não conta (a.callAFK filtra).
	badgeService := badge.BadgeService(badge.BadgeRepository(a.db), a.hub, a.callAFK, a.hub, nil)
	badgeHandler := badge.BadgeHandler(badgeService)
	a.wireBadgeEvents(badgeService)
	// Amizade aceita já reavalia o badge Amigos das duas pessoas.
	a.friendAccepted.OnAccepted(badgeService.Refresh)

	// Enquetes de escolha única (hoje: badge do segundo turno). Opção com badge
	// reavalia os badges na hora; só contas anteriores ao corte da enquete a veem.
	enqueteHandler := enquete.EnqueteHandler(enquete.EnqueteService(
		enquete.EnqueteRepository(a.db), badgeService, enquete.Todas,
	))

	// Card novo no quadro já reavalia o badge Contribuinte de quem criou.
	proposalService := proposal.ProposalService(proposal.ProposalRepository(a.db), a.hub, issueCreator, proposalImages, techIDs).
		WithNotifier(salinhaBotNotifier{conversations: a.conversationService, messages: a.messageService}).
		WithBadges(badgeService)
	proposalHandler := proposal.ProposalHandler(proposalService, proposalImages, a.uploadSpace)
	go proposalService.Run(a.ctx)
	notifySettingsHandler := notifysettings.NotifySettingsHandler(
		notifysettings.NotifySettingsService(notifysettings.NotifySettingsRepository(a.db), a.permissionService, a.hub),
	)
	a.badgeDone = make(chan struct{})
	go func() {
		defer close(a.badgeDone)
		badgeService.Run(a.ctx)
	}()

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		level.LevelRoutes(api, levelHandler, rankingHandler, a.authMiddleware)
		badge.BadgeRoutes(api, badgeHandler, a.authMiddleware)
		enquete.EnqueteRoutes(api, enqueteHandler, a.authMiddleware)
		notifysettings.Routes(api, notifySettingsHandler, a.authMiddleware)
		proposal.ProposalRoutes(api, proposalHandler, a.authMiddleware, a.requireVerified)
		birthday.BirthdayRoutes(api, birthdayHandler, a.authMiddleware)
	})
}

// salinhaBotNotifier: o Salinha Bot escreve na DM de quem sugeriu o card
// (abre a DM sem as regras de amizade; a conversa é só leitura para a pessoa).
type salinhaBotNotifier struct {
	conversations *conversation.Service
	messages      *message.Service
}

func (n salinhaBotNotifier) Notify(ctx context.Context, userID, text string) error {
	conv, err := n.conversations.GetOrCreateBotDM(ctx, bot.SalinhaBotID, userID)
	if err != nil {
		return err
	}
	_, err = n.messages.CreateConversationMessage(ctx, conv.ID, bot.SalinhaBotID, text, nil, nil, nil, nil, nil)
	return err
}
