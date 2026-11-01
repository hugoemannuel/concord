package call

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"sort"
	"sync"
	"time"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"
)

var (
	ErrNotFound       = errors.New("call not found")
	ErrBusy           = errors.New("user is busy in another call")
	ErrCalleeOffline  = errors.New("callee is offline")
	ErrNotParticipant = errors.New("you are not a participant of this conversation")
	ErrBlocked        = errors.New("you cannot call this user")
	ErrNotMember      = errors.New("you are not a member of this server")
	ErrNotAllowed     = errors.New("not allowed")
	ErrInvalidType    = errors.New("invalid call type")
)

type EventPublisher interface {
	SendToUser(userID string, event []byte)
	BroadcastToCall(callID string, event []byte)
	BroadcastToRoom(room string, event []byte)
}

type ParticipantInfo struct {
	UserInfo
	CallID   string    `json:"call_id"`
	UserID   string    `json:"user_id"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
	Muted    bool      `json:"muted"`
	Deafened bool      `json:"deafened"`
	// Impostos por um moderador (silenciar/ensurdecer no servidor).
	ServerMuted    bool `json:"server_muted"`
	ServerDeafened bool `json:"server_deafened"`
}

type StateResponse struct {
	Call           *Call                 `json:"call"`
	Participants   []ParticipantInfo     `json:"participants"`
	ScreenSharing  []string              `json:"screen_sharing,omitempty"`
	ScreenWatchers map[string][]UserInfo `json:"screen_watchers,omitempty"`
	// Atividade aberta na chamada. Só vai para quem está nela (ver Handler.State).
	Activity *ActivityEvent `json:"activity,omitempty"`
	// Pedidos para entrar na sala trancada. Só vai para participantes (rota
	// de estado da chamada), nunca na lista do servidor.
	JoinRequests []UserInfo `json:"join_requests,omitempty"`
}

type participantState struct {
	userID   string
	role     string
	joinedAt time.Time
	muted    bool
	deafened bool
	// serverMuted/serverDeafened: impostos por quem tem MUTE/DEAFEN_MEMBERS;
	// duram até o fim da chamada ou até um moderador liberar.
	serverMuted    bool
	serverDeafened bool
	lastSoundAt    time.Time
	// lastActivityAt: última vez que abriu ou trocou o link de uma atividade.
	lastActivityAt time.Time
}

type activeCall struct {
	info         *Call
	participants map[string]*participantState
	inviteeID    string

	// Sala trancada (ver lock.go). Mapas criados sob demanda.
	joinRequests map[string]*joinRequest // userID -> pedido pendente
	admitted     map[string]time.Time    // userID -> até quando pode entrar sem pedir
	declinedAt   map[string]time.Time    // userID -> última recusa (anti-spam)

	// Convites de amigos (ver friend_invite.go). Criado sob demanda.
	invites *inviteBook

	// Espectadores de tela: sharerID -> set de watcherUserIDs
	screenWatchers map[string]map[string]struct{}
	// Miniatura da tela de cada um, para o cartão de perfil (ver screen_preview.go).
	screenPreviews map[string]*screenPreview
}

type Service struct {
	repository          *Repository
	publisher           EventPublisher
	conversationService *conversation.Service
	blockedCheck        func(ctx context.Context, a string, b string) (bool, error)
	serverService       *server.Service
	channelService      *channel.Service
	userService         *user.Service
	isOnline            func(userID string) bool
	// Toque para quem está offline e tem push, limite de toque e observadores do convite (ring.go).
	offlineRinger func(userID string) bool
	ringTimeout   time.Duration
	onDMInvite    []func(DMInvite)
	perms         PermissionSource
	invite        inviteDeps
	// Visitantes (convite de visitante, ver guest.go).
	guests GuestAccess
	// Canal pelo id (trocável nos testes, que não têm banco).
	findChannel func(ctx context.Context, id string) (*channel.Channel, error)
	// Conversa pelo id (trocável nos testes, que não têm banco).
	findConversation func(ctx context.Context, id string) (*conversation.Conversation, error)
	media            MediaAdmin

	mu    sync.RWMutex
	calls map[string]*activeCall
	busy  map[string]string
	// screenSharers: callID -> set de userIDs compartilhando tela (transitório)
	screenSharers map[string]map[string]struct{}
	// activities: callID -> atividade aberta (transitório)
	activities       map[string]*callActivity
	activityCooldown time.Duration

	// Queda do WS de chat só tira o usuário da chamada se ele não voltar dentro
	// desse prazo — a mídia (LiveKit) aguenta quedas curtas sozinha.
	disconnectGrace      time.Duration
	leaveAfterDisconnect func(ctx context.Context, callID string, userID string) error
	// Saída forçada por moderação (trocável nos testes, que não têm banco).
	leaveCall func(ctx context.Context, callID string, userID string) error
	// Nome exibido no token do LiveKit (ver Handler.Token).
	mediaName func(ctx context.Context, userID string) string
	// Dados do usuário nos eventos de tela (trocável nos testes).
	lookupUser func(ctx context.Context, userID string) (UserInfo, error)
	soundboard soundboardDeps

	// Hooks do bot de música (internal/music): saída de alguém e fim da call.
	onParticipantLeft []func(callID, userID string)
	onCallEnded       []func(callID string)
	// Onde o mudo/ensurdecido e a tela ficam salvos para o reinício (o banco).
	stateStore participantStateStore
	// De onde RestoreActive lê as chamadas na subida (o banco).
	restoreStore restoreStore
	// Grava a entrada de alguém na chamada (trocável nos testes).
	addParticipant func(ctx context.Context, participant *CallParticipant) error
}

const defaultDisconnectGrace = 15 * time.Second

// SetBlockedCheck liga a checagem de bloqueio da chamada na DM.
func (s *Service) SetBlockedCheck(check func(ctx context.Context, a string, b string) (bool, error)) {
	s.blockedCheck = check
}

func CallService(
	repository *Repository,
	publisher EventPublisher,
	conversationService *conversation.Service,
	serverService *server.Service,
	channelService *channel.Service,
	userService *user.Service,
	isOnline func(userID string) bool,
) *Service {
	s := &Service{
		repository:          repository,
		publisher:           publisher,
		conversationService: conversationService,
		serverService:       serverService,
		channelService:      channelService,
		userService:         userService,
		isOnline:            isOnline,
		calls:               make(map[string]*activeCall),
		busy:                make(map[string]string),
		screenSharers:       make(map[string]map[string]struct{}),
		activities:          make(map[string]*callActivity),
		activityCooldown:    activityCooldown,
		disconnectGrace:     defaultDisconnectGrace,
	}
	if repository != nil {
		s.stateStore = repository
		s.restoreStore = repository
		s.addParticipant = repository.AddParticipant
	} else {
		s.addParticipant = func(context.Context, *CallParticipant) error { return nil }
	}
	s.findChannel = func(ctx context.Context, id string) (*channel.Channel, error) {
		return channelService.FindByID(ctx, id)
	}
	s.findConversation = func(ctx context.Context, id string) (*conversation.Conversation, error) {
		return conversationService.FindByID(ctx, id)
	}
	s.leaveAfterDisconnect = s.Leave
	s.leaveCall = s.Leave
	s.lookupUser = s.userInfo
	s.mediaName = func(ctx context.Context, userID string) string {
		info, err := s.userInfo(ctx, userID)
		if err != nil {
			return ""
		}
		return info.DisplayName
	}
	return s
}

func (s *Service) Join(ctx context.Context, callID string, userID string) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		s.mu.Unlock()
		return ErrNotFound
	}
	isChannel := ac.info.Type == TypeChannel
	var channelID string
	if isChannel && ac.info.ChannelID != nil {
		channelID = *ac.info.ChannelID
	}
	s.mu.Unlock()

	if isChannel {
		if err := s.requireConnect(ctx, channelID, userID); err != nil {
			return err
		}
	}

	s.mu.Lock()
	if isChannel && !canEnterLockedLocked(ac, userID, time.Now()) {
		s.mu.Unlock()
		return ErrLocked
	}
	_, err := s.joinLocked(ctx, ac, userID, RoleMember)
	s.mu.Unlock()
	return err
}

func (s *Service) Leave(ctx context.Context, callID string, userID string) error {
	remaining, removed, err := s.detachParticipant(callID, userID)
	if err != nil {
		return err
	}
	if !removed {
		return nil
	}

	if err := s.repository.MarkParticipantLeft(ctx, callID, userID); err != nil {
		log.Printf("[call] persist leave %s failed: %v", userID, err)
	}

	userInfo, err := s.userInfo(ctx, userID)
	if err == nil {
		s.publisher.BroadcastToCall(callID, marshalEvent("call:left", StateEvent{
			CallID: callID,
			User:   userInfo,
		}))
	}

	if remaining == 0 {
		return s.End(ctx, callID)
	}

	return nil
}

// detachParticipant tira o usuário da chamada em memória (participantes,
// ocupado, transmissão). Se ele saiu transmitindo, avisa o servidor na hora
// para o selo LIVE sumir. removed = false se ele não estava na chamada.
func (s *Service) detachParticipant(callID, userID string) (remaining int, removed bool, err error) {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.Unlock()
		return 0, false, ErrNotFound
	}
	if _, ok := ac.participants[userID]; !ok {
		s.mu.Unlock()
		return len(ac.participants), false, nil
	}
	delete(ac.participants, userID)
	delete(s.busy, userID)
	wasSharing := false
	if sharers, ok := s.screenSharers[callID]; ok {
		_, wasSharing = sharers[userID]
		delete(sharers, userID)
	}
	affectedSharers := dropScreenWatcherLocked(ac, userID)
	delete(ac.screenPreviews, userID)
	clearedSharer := false
	if wasSharing {
		clearedSharer = clearSharerWatchersLocked(ac, userID)
	}
	remaining = len(ac.participants)
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	hooks := append([]func(string, string){}, s.onParticipantLeft...)
	// Quem abriu a atividade saiu: ela acaba; quem só jogava sai da lista.
	activityChange := s.dropActivityOfLocked(callID, userID)
	targets := participantIDsLocked(ac)
	s.mu.Unlock()
	for _, fn := range hooks {
		fn(callID, userID)
	}

	if activityChange != nil {
		s.sendToAll(targets, activityChange)
	}
	if wasSharing {
		s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: false})
	}
	for sharerID, watcherIDs := range affectedSharers {
		watchers := s.resolveWatchersInfo(context.Background(), watcherIDs)
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: sharerID,
			Watchers: watchers,
		}))
	}
	if clearedSharer {
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: userID,
			Watchers: []UserInfo{},
		}))
	}
	return remaining, true, nil
}

// publishLive avisa a sala do servidor que alguém entrou/saiu do ar. Chamadas
// sem servidor (DM) não têm lista de canal de voz: nada a fazer.
func (s *Service) publishLive(serverID string, ev LiveEvent) {
	if serverID == "" {
		return
	}
	s.broadcastServer(serverID, ev.ChannelID, marshalEvent("call:live", ev))
}

func (s *Service) End(ctx context.Context, callID string) error {
	if err := s.closeCall(callID); err != nil {
		return err
	}

	if s.repository != nil {
		if err := s.repository.EndCall(ctx, callID); err != nil {
			log.Printf("[call] persist end %s failed: %v", callID, err)
		}
	}

	s.publisher.BroadcastToCall(callID, marshalEvent("call:ended", EndedEvent{
		CallID: callID,
	}))

	return nil
}

// closeCall tira a chamada da memória. Quem ainda transmitia sai do ar no
// servidor na hora (o selo LIVE não espera o próximo polling).
func (s *Service) closeCall(callID string) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.Unlock()
		return ErrNotFound
	}
	for pid := range ac.participants {
		delete(s.busy, pid)
	}
	sharers := s.screenSharers[callID]
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	srvID := ac.info.ServerID
	knockers := pendingRequestersLocked(ac)
	invited := cancelInvitesLocked(ac)
	delete(s.calls, callID)
	delete(s.screenSharers, callID)
	endHooks := append([]func(string){}, s.onCallEnded...)
	delete(s.activities, callID)
	s.mu.Unlock()
	for _, fn := range endHooks {
		fn(callID)
	}

	for userID := range sharers {
		s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: false})
	}
	s.notifyCancelledInvites(callID, invited)
	// Sala esvaziou: quem esperava na porta já pode entrar (a próxima chamada
	// nasce destrancada).
	for _, uid := range knockers {
		s.publisher.SendToUser(uid, marshalEvent("call:knock_declined", KnockAnswerEvent{
			CallID: callID, ChannelID: channelID, ServerID: srvID, Reason: KnockEnded,
		}))
	}
	return nil
}

func (s *Service) EndByUser(ctx context.Context, callID string, userID string) error {
	s.mu.RLock()
	_, ok := s.calls[callID]
	var isParticipant bool
	if ok {
		_, isParticipant = s.calls[callID].participants[userID]
	}
	s.mu.RUnlock()
	if !ok {
		return ErrNotFound
	}
	if !isParticipant {
		return ErrNotAllowed
	}
	return s.End(ctx, callID)
}

// SetScreenShare marca/desmarca um participante como compartilhando tela,
// publica call:screen para os demais participantes da chamada e call:live
// para o servidor (selo LIVE na lista do canal de voz).
func (s *Service) SetScreenShare(ctx context.Context, callID string, userID string, active bool) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		s.mu.Unlock()
		return ErrNotFound
	}
	if _, ok := ac.participants[userID]; !ok {
		s.mu.Unlock()
		return ErrNotAllowed
	}

	sharers, ok := s.screenSharers[callID]
	if !ok {
		sharers = make(map[string]struct{})
		s.screenSharers[callID] = sharers
	}
	// O app reenvia o estado ao reconectar: sem mudança, ninguém é avisado
	// (o selo LIVE não pisca).
	if _, sharing := sharers[userID]; sharing == active {
		s.mu.Unlock()
		return nil
	}
	clearedWatchers := false
	if active {
		sharers[userID] = struct{}{}
	} else {
		delete(sharers, userID)
		delete(ac.screenPreviews, userID)
		clearedWatchers = clearSharerWatchersLocked(ac, userID)
	}

	targets := make([]string, 0, len(ac.participants))
	for pid := range ac.participants {
		if pid != userID {
			targets = append(targets, pid)
		}
	}
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	s.mu.Unlock()

	if clearedWatchers {
		s.publisher.BroadcastToCall(callID, marshalEvent("call:screen_watchers", ScreenWatchersEvent{
			CallID:   callID,
			SharerID: userID,
			Watchers: []UserInfo{},
		}))
	}

	s.saveScreenSharing(callID, userID, active)
	s.publishLive(serverID, LiveEvent{CallID: callID, ChannelID: channelID, UserID: userID, Active: active})

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		return err
	}

	for _, pid := range targets {
		s.publisher.SendToUser(pid, marshalEvent("call:screen", ScreenEvent{
			CallID: callID,
			User:   userInfo,
			Active: active,
		}))
	}
	return nil
}

// SetVoiceState registra se o participante está mudo/ensurdecido e avisa a
// chamada e o servidor (para a lista do canal de voz).
func (s *Service) SetVoiceState(callID string, userID string, muted bool, deafened bool) error {
	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		s.mu.Unlock()
		return ErrNotFound
	}
	p, ok := ac.participants[userID]
	if !ok {
		s.mu.Unlock()
		return ErrNotAllowed
	}
	// O app reenvia o estado ao reconectar: sem mudança, ninguém é avisado.
	if p.muted == muted && p.deafened == deafened {
		s.mu.Unlock()
		return nil
	}
	p.muted = muted
	p.deafened = deafened
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	event := marshalEvent("call:voice", VoiceEvent{
		CallID:         callID,
		ChannelID:      ac.info.ChannelID,
		UserID:         userID,
		Muted:          muted,
		Deafened:       deafened,
		ServerMuted:    p.serverMuted,
		ServerDeafened: p.serverDeafened,
	})
	s.mu.Unlock()

	s.saveVoiceState(callID, userID, muted, deafened)
	s.publisher.BroadcastToCall(callID, event)
	if serverID != "" {
		s.broadcastServer(serverID, channelID, event)
	}
	return nil
}

func (s *Service) participantInfos(callID string) []ParticipantInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ac, ok := s.calls[callID]
	if !ok {
		return nil
	}
	return participantInfosLocked(callID, ac)
}

func participantInfosLocked(callID string, ac *activeCall) []ParticipantInfo {
	participants := make([]ParticipantInfo, 0, len(ac.participants))
	for _, p := range ac.participants {
		participants = append(participants, ParticipantInfo{
			CallID:   callID,
			UserID:   p.userID,
			Role:     p.role,
			JoinedAt: p.joinedAt,
			Muted:    p.muted,
			Deafened: p.deafened,

			ServerMuted:    p.serverMuted,
			ServerDeafened: p.serverDeafened,
		})
	}
	// Ordem estável (quem entrou primeiro, depois id): o map muda de ordem a
	// cada leitura e a lista do canal de voz pulava a cada polling.
	sort.Slice(participants, func(i, j int) bool {
		a, b := participants[i], participants[j]
		if !a.JoinedAt.Equal(b.JoinedAt) {
			return a.JoinedAt.Before(b.JoinedAt)
		}
		return a.UserID < b.UserID
	})
	return participants
}

func (s *Service) IsBusy(userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.busy[userID]
	return ok
}

func (s *Service) IsParticipant(callID string, userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ac, ok := s.calls[callID]
	if !ok {
		return false
	}
	_, ok = ac.participants[userID]
	return ok
}

func (s *Service) FindActiveByScope(scope string, scopeID string) (*Call, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ac := s.findActiveByScopeLocked(scope, scopeID)
	if ac == nil {
		return nil, ErrNotFound
	}
	return ac.info, nil
}

// ListActiveByServer retorna o estado de todas as chamadas de canal
// ativas em um servidor (para listar conectados nos canais de voz).
func (s *Service) ListActiveByServer(ctx context.Context, serverID string) ([]*StateResponse, error) {
	s.mu.RLock()
	callIDs := make([]string, 0)
	for id, ac := range s.calls {
		if ac.info.Type == TypeChannel && ac.info.ServerID != nil &&
			*ac.info.ServerID == serverID && ac.info.Status != StatusEnded {
			callIDs = append(callIDs, id)
		}
	}
	s.mu.RUnlock()

	states := make([]*StateResponse, 0, len(callIDs))
	for _, id := range callIDs {
		state, err := s.GetState(ctx, id)
		if err != nil {
			continue
		}
		states = append(states, state)
	}
	return states, nil
}

func (s *Service) GetState(ctx context.Context, callID string) (*StateResponse, error) {
	s.mu.RLock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.RUnlock()
		return nil, ErrNotFound
	}

	participants := participantInfosLocked(callID, ac)
	callCopy := *ac.info
	screenSharing := make([]string, 0)
	if sharers, ok := s.screenSharers[callID]; ok {
		for uid := range sharers {
			screenSharing = append(screenSharing, uid)
		}
		sort.Strings(screenSharing)
	}
	watchersSnapshot := collectScreenWatchersSnapshotLocked(ac)
	s.mu.RUnlock()

	for i := range participants {
		info, err := s.lookupUser(ctx, participants[i].UserID)
		if err != nil {
			continue
		}
		participants[i].UserInfo = info
	}

	var screenWatchers map[string][]UserInfo
	if len(watchersSnapshot) > 0 {
		screenWatchers = make(map[string][]UserInfo, len(watchersSnapshot))
		for sharerID, watcherIDs := range watchersSnapshot {
			screenWatchers[sharerID] = s.resolveWatchersInfo(ctx, watcherIDs)
		}
	}

	return &StateResponse{
		Call:           &callCopy,
		Participants:   participants,
		ScreenSharing:  screenSharing,
		ScreenWatchers: screenWatchers,
	}, nil
}

func (s *Service) HandleCallMessage(userID string, evType string, payload json.RawMessage) {
	ctx := context.Background()

	switch evType {
	case "call:invite":
		var p InvitePayload
		if err := json.Unmarshal(payload, &p); err != nil {
			s.sendError(userID, "", "invalid call:invite payload")
			return
		}
		switch p.Type {
		case TypeDM:
			if _, err := s.StartDM(ctx, userID, p.ConversationID); err != nil {
				s.handleStartError(userID, "", err)
			}
		case TypeChannel:
			if _, err := s.StartChannel(ctx, userID, p.ChannelID); err != nil {
				s.handleStartError(userID, "", err)
			}
		default:
			s.sendError(userID, "", ErrInvalidType.Error())
		}
	case "call:accept":
		var p LeavePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:accept payload")
			return
		}
		if err := s.Accept(ctx, p.CallID, userID); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:decline":
		var p LeavePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:decline payload")
			return
		}
		if err := s.Decline(ctx, p.CallID, userID); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:leave":
		var p LeavePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:leave payload")
			return
		}
		if err := s.Leave(ctx, p.CallID, userID); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:voice":
		var p VoicePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:voice payload")
			return
		}
		if err := s.SetVoiceState(p.CallID, userID, p.Muted, p.Deafened); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:screen":
		var p ScreenPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:screen payload")
			return
		}
		if err := s.SetScreenShare(ctx, p.CallID, userID, p.Active); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:screen_watch":
		var p ScreenWatchPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" || p.SharerID == "" {
			s.sendError(userID, "", "invalid call:screen_watch payload")
			return
		}
		if err := s.SetScreenWatching(ctx, p.CallID, p.SharerID, userID, p.Watching); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:screen_draw":
		var p ScreenDrawPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" || p.SharerID == "" {
			s.sendError(userID, "", "invalid call:screen_draw payload")
			return
		}
		if err := s.HandleScreenDraw(ctx, userID, p); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:screen_draw_clear":
		var p ScreenDrawClearPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" || p.SharerID == "" {
			s.sendError(userID, "", "invalid call:screen_draw_clear payload")
			return
		}
		if err := s.HandleScreenDrawClear(ctx, userID, p); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:screen_draw_undo":
		var p ScreenDrawUndoPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" || p.SharerID == "" || p.StrokeID == "" {
			s.sendError(userID, "", "invalid call:screen_draw_undo payload")
			return
		}
		if err := s.HandleScreenDrawUndo(ctx, userID, p); err != nil {
			s.sendError(userID, p.CallID, err.Error())
		}
	case "call:soundboard":
		s.handleSoundboardMessage(ctx, userID, payload)
	case "call:activity":
		s.handleActivityMessage(ctx, userID, payload)
	case "call:activity:stop":
		s.handleActivityStopMessage(userID, payload)
	case "call:activity:join":
		s.handleActivityPresenceMessage(userID, true, payload)
	case "call:activity:leave":
		s.handleActivityPresenceMessage(userID, false, payload)
	case "call:lock":
		var p LockPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:lock payload")
			return
		}
		if err := s.SetLocked(ctx, p.CallID, userID, p.Locked); err != nil {
			s.sendKnockError(userID, p.CallID, err)
		}
	case "call:knock":
		var p LeavePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			s.sendError(userID, "", "invalid call:knock payload")
			return
		}
		if err := s.RequestJoin(ctx, p.CallID, userID); err != nil {
			s.sendKnockError(userID, p.CallID, err)
		}
	case "call:knock_cancel":
		var p LeavePayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" {
			return
		}
		_ = s.CancelJoinRequest(p.CallID, userID)
	case "call:knock_respond":
		var p KnockRespondPayload
		if err := json.Unmarshal(payload, &p); err != nil || p.CallID == "" || p.UserID == "" {
			s.sendError(userID, "", "invalid call:knock_respond payload")
			return
		}
		if err := s.RespondJoinRequest(ctx, p.CallID, userID, p.UserID, p.Accept); err != nil {
			s.sendKnockError(userID, p.CallID, err)
		}
	default:
		log.Printf("[call] unhandled ws event %q from user %s", evType, userID)
	}
}

func (s *Service) joinLocked(ctx context.Context, ac *activeCall, userID string, role string) (*Call, error) {
	if ac.info.Status == StatusEnded {
		return nil, ErrNotFound
	}
	if _, ok := ac.participants[userID]; ok {
		return ac.info, nil
	}
	if otherID, ok := s.busy[userID]; ok && otherID != ac.info.ID {
		return nil, ErrBusy
	}

	userInfo, err := s.lookupUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ac.participants[userID] = &participantState{
		userID:   userID,
		role:     role,
		joinedAt: now,
	}
	if ac.info.Status != StatusActive {
		ac.info.Status = StatusActive
		s.markCallActive(ac.info.ID)
	}
	s.busy[userID] = ac.info.ID
	s.consumeInviteLocked(ac, userID)

	if err := s.addParticipant(ctx, &CallParticipant{
		CallID: ac.info.ID,
		UserID: userID,
		Role:   role,
	}); err != nil {
		log.Printf("[call] persist participant %s failed: %v", userID, err)
	}

	s.publisher.BroadcastToCall(ac.info.ID, marshalEvent("call:joined", StateEvent{
		CallID: ac.info.ID,
		User:   userInfo,
	}))

	return ac.info, nil
}

func (s *Service) findActiveByScopeLocked(scope string, scopeID string) *activeCall {
	for _, ac := range s.calls {
		if ac.info.Status == StatusEnded {
			continue
		}
		switch scope {
		case TypeDM:
			if ac.info.ConversationID != nil && *ac.info.ConversationID == scopeID {
				return ac
			}
		case TypeChannel:
			if ac.info.ChannelID != nil && *ac.info.ChannelID == scopeID {
				return ac
			}
		}
	}
	return nil
}

func (s *Service) sendError(userID string, callID string, message string) {
	s.publisher.SendToUser(userID, marshalEvent("call:error", ErrorEvent{
		CallID:  callID,
		Message: message,
	}))
}

func (s *Service) handleStartError(userID string, callID string, err error) {
	if errors.Is(err, ErrBusy) {
		s.publisher.SendToUser(userID, marshalEvent("call:busy", BusyEvent{CallID: callID}))
		return
	}
	s.sendError(userID, callID, err.Error())
}
