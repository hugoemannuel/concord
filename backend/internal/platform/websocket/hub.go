package websocket

import (
	"context"
	"log"
	"sync"
	"time"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/coder/websocket"
)

// CloseServiceRestart (1012) avisa o app que o servidor está reiniciando: ele
// reconecta logo, sem o backoff normal nem aviso de "reconectando".
const (
	CloseServiceRestart = websocket.StatusServiceRestart
	closeRestartReason  = "servidor reiniciando"
)

type Hub struct {
	mu           sync.RWMutex
	clients      map[*Client]struct{}
	rooms        map[string]map[*Client]struct{}
	presence     map[string]int
	statuses     map[string]string // status escolhido (online, idle, dnd, invisible)
	statusLookup StatusLookup
	// Atividade (jogo e música) por usuário; só memória (activity.go).
	rich         richPresence
	audience     AudienceProvider
	onDisconnect func(userID string)
	// Desligando (deploy): quem cai não "saiu", então nem presença offline
	// nem saída da chamada — o processo novo recarrega tudo.
	shuttingDown bool

	visibility     VisibilityProvider
	onPermsChanged func(serverID string)
}

// VisibilityProvider dá o estado de permissões do servidor (permission.Service):
// o hub usa para decidir quem recebe eventos de um canal e quem continua nas
// salas depois de uma mudança de cargos.
type VisibilityProvider interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// StatusLookup lê do banco o status escolhido por quem acabou de conectar.
type StatusLookup func(ctx context.Context, userID string) (string, error)

func NewHub() *Hub {
	return &Hub{
		clients:  make(map[*Client]struct{}),
		rooms:    make(map[string]map[*Client]struct{}),
		presence: make(map[string]int),
		statuses: make(map[string]string),
		rich:     newRichPresence(),
	}
}

// SetVisibility liga o filtro de eventos por permissão. Sem ele, eventos de
// canal de servidor não são entregues na sala do servidor (falha fechada).
func (h *Hub) SetVisibility(v VisibilityProvider) {
	h.mu.Lock()
	h.visibility = v
	h.mu.Unlock()
}

// SetPermissionsChangedHook registra o que mais fazer quando as permissões de
// um servidor mudam (ex.: reaplicar nas chamadas de voz). Roda em goroutine.
func (h *Hub) SetPermissionsChangedHook(fn func(serverID string)) {
	h.mu.Lock()
	h.onPermsChanged = fn
	h.mu.Unlock()
}

func (h *Hub) SetStatusLookup(fn StatusLookup) {
	h.mu.Lock()
	h.statusLookup = fn
	h.mu.Unlock()
}

// SetDisconnectHandler registers a callback invoked when the last WS
// connection of a user closes (user fully offline).
func (h *Hub) SetDisconnectHandler(fn func(userID string)) {
	h.mu.Lock()
	h.onDisconnect = fn
	h.mu.Unlock()
}

// Register põe a conexão no hub. Devolve false (e não registra) se o
// servidor já está desligando: a conexão chegou depois do Shutdown fechar as
// outras, e quem a abriu deve ir para o processo novo.
func (h *Hub) Register(client *Client) bool {
	h.mu.Lock()
	if h.shuttingDown {
		h.mu.Unlock()
		return false
	}
	h.clients[client] = struct{}{}
	h.presence[client.userID]++
	wasOffline := h.presence[client.userID] == 1
	lookup := h.statusLookup
	h.mu.Unlock()

	if !wasOffline {
		return true
	}
	status := user.StatusOnline
	if lookup != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		if stored, err := lookup(ctx, client.userID); err == nil {
			status = stored
		} else {
			log.Printf("[ws] status lookup for %s: %v", client.userID, err)
		}
		cancel()
	}
	h.mu.Lock()
	h.statuses[client.userID] = status
	h.mu.Unlock()

	// Invisível conecta sem ninguém ficar sabendo.
	if status != user.StatusInvisible {
		h.broadcastPresence(client.userID, user.EffectiveStatus(status, true))
	}
	return true
}

func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	delete(h.clients, client)
	for room := range client.rooms {
		h.removeFromRoomLocked(client, room)
	}
	client.rooms = map[string]struct{}{}

	wasOnline := false
	hadActivity := false
	h.presence[client.userID]--
	if h.presence[client.userID] <= 0 {
		wasInvisible := h.statuses[client.userID] == user.StatusInvisible
		delete(h.presence, client.userID)
		delete(h.statuses, client.userID)
		hadActivity = h.rich.drop(client.userID)
		wasOnline = !h.shuttingDown && !wasInvisible
	}
	h.mu.Unlock()

	if wasOnline && hadActivity {
		h.publishActivity(client.userID, ActivityEntry{})
	}

	if wasOnline && h.onDisconnect != nil {
		h.onDisconnect(client.userID)
	}

	if wasOnline {
		h.broadcastPresence(client.userID, user.StatusOffline)
	}
}

// Shutdown fecha todas as conexões com 1012 ("servidor reiniciando") e espera
// os fechamentos até ctx acabar. Chamado no desligamento, depois de o servidor
// HTTP parar de aceitar conexões, para os clientes reconectarem no processo novo.
func (h *Hub) Shutdown(ctx context.Context) {
	h.mu.Lock()
	h.shuttingDown = true
	conns := make([]*websocket.Conn, 0, len(h.clients))
	cancels := make([]context.CancelFunc, 0, len(h.clients))
	for client := range h.clients {
		conns = append(conns, client.conn)
		if client.cancel != nil {
			cancels = append(cancels, client.cancel)
		}
	}
	h.mu.Unlock()

	var wg sync.WaitGroup
	for _, conn := range conns {
		wg.Add(1)
		go func(conn *websocket.Conn) {
			defer wg.Done()
			// Close espera o "ok" do cliente (até 5 s, ou até o prazo do ctx).
			_ = conn.Close(CloseServiceRestart, closeRestartReason)
		}(conn)
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		// O 1012 já foi escrito; quem não confirmou (cliente parado) é
		// derrubado: cancelar a leitura fecha a conexão e solta o Close.
		for _, cancel := range cancels {
			cancel()
		}
	}
}

// ShuttingDown diz se o servidor já começou a desligar.
func (h *Hub) ShuttingDown() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.shuttingDown
}

// PublishUserUpdate manda o perfil novo (nome, avatar, banner, bio...) para
// todo mundo, como a presença.
func (h *Hub) PublishUserUpdate(profile user.PublicProfile) {
	h.BroadcastAll(writeEvent("user:update", map[string]interface{}{
		"user": profile,
	}))
}

func (h *Hub) Subscribe(client *Client, room string) {
	h.mu.Lock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*Client]struct{})
	}
	h.rooms[room][client] = struct{}{}
	client.rooms[room] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unsubscribe(client *Client, room string) {
	h.mu.Lock()
	h.removeFromRoomLocked(client, room)
	h.mu.Unlock()
}

func (h *Hub) removeFromRoomLocked(client *Client, room string) {
	if members, ok := h.rooms[room]; ok {
		delete(members, client)
		if len(members) == 0 {
			delete(h.rooms, room)
		}
	}
	delete(client.rooms, room)
}

func (h *Hub) BroadcastToRoom(room string, event []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.rooms[room] {
		select {
		case client.send <- event:
		default:
			// client is slow; drop event for it
		}
	}
}

// BroadcastToRoomFiltered entrega só a quem allow(userID) aceita.
func (h *Hub) BroadcastToRoomFiltered(room string, event []byte, allow func(userID string) bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.rooms[room] {
		if !allow(client.userID) {
			continue
		}
		select {
		case client.send <- event:
		default:
			// client is slow; drop event for it
		}
	}
}

// snapshot lê as permissões do servidor (nil se não der: quem chama não
// entrega nada, em vez de vazar).
func (h *Hub) snapshot(serverID string) *permission.Snapshot {
	h.mu.RLock()
	v := h.visibility
	h.mu.RUnlock()
	if v == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	snap, err := v.Snapshot(ctx, serverID)
	if err != nil {
		log.Printf("[ws] permissions of server %s: %v", serverID, err)
		return nil
	}
	return snap
}

// BroadcastToServerChannel manda para a sala do servidor só a quem vê o canal
// (mensagens e canais privados não vazam para o resto do servidor).
func (h *Hub) BroadcastToServerChannel(serverID, channelID string, event []byte) {
	snap := h.snapshot(serverID)
	if snap == nil {
		return
	}
	h.BroadcastToRoomFiltered("server:"+serverID, event, func(userID string) bool {
		return snap.CanView(channelID, userID)
	})
}

// RevalidateServer tira das salas do servidor e dos canais quem deixou de ter
// acesso (mudança de cargo, canal virou privado, expulsão, banimento).
func (h *Hub) RevalidateServer(serverID string) {
	snap := h.snapshot(serverID)
	if snap == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	serverRoom := "server:" + serverID
	for client := range h.rooms[serverRoom] {
		if !snap.IsMember(client.userID) {
			h.removeFromRoomLocked(client, serverRoom)
		}
	}
	for channelID := range snap.Channels {
		room := "channel:" + channelID
		for client := range h.rooms[room] {
			if !snap.CanView(channelID, client.userID) {
				h.removeFromRoomLocked(client, room)
			}
		}
	}
}

// BroadcastToRoomsExcept entrega o evento uma vez por conexão presente em
// qualquer das salas, pulando as conexões de exceptUserID.
func (h *Hub) BroadcastToRoomsExcept(rooms []string, exceptUserID string, event []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	// Uma sala só (canal) não tem como repetir conexão.
	var sent map[*Client]struct{}
	if len(rooms) > 1 {
		sent = make(map[*Client]struct{})
	}
	for _, room := range rooms {
		for client := range h.rooms[room] {
			if client.userID == exceptUserID {
				continue
			}
			if sent != nil {
				if _, ok := sent[client]; ok {
					continue
				}
				sent[client] = struct{}{}
			}
			select {
			case client.send <- event:
			default:
				// client is slow; drop event for it
			}
		}
	}
}

func (h *Hub) BroadcastAll(event []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		select {
		case client.send <- event:
		default:
			// client is slow; drop event for it
		}
	}
}

// PublishAppUpdate avisa todos os apps conectados que saiu versão nova
// (manifesto do electron-updater mudou): eles checam na hora.
func (h *Hub) PublishAppUpdate(file, version string) {
	h.BroadcastAll(writeEvent("app:update", map[string]string{
		"file":    file,
		"version": version,
	}))
}

// Canal novo ou alterado só aparece para quem o vê.
func (h *Hub) PublishServerUpdate(event server.UpdateEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:update", event))
}

func (h *Hub) PublishServerDelete(event server.DeleteEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:delete", event))
}

func (h *Hub) PublishMemberUpdate(event server.MemberJoinEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:update", event))
}

// PublishMemberNickname: o apelido de alguém mudou; todo o servidor atualiza
// o nome na hora (lista de membros, chat, voz).
func (h *Hub) PublishMemberNickname(event server.NicknameEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:nickname", event))
}

func (h *Hub) PublishMemberJoin(event server.MemberJoinEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:join", event))
}

func (h *Hub) PublishMemberLeave(event server.MemberLeaveEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:leave", event))
}

// PublishMemberRemoved: saiu, foi expulso ou banido. Os outros veem o membro
// sair; quem saiu recebe server:removed e perde as salas do servidor.
func (h *Hub) PublishMemberRemoved(event server.MemberRemovedEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:leave", server.MemberLeaveEvent{
		ServerID: event.ServerID,
		UserID:   event.UserID,
	}))
	h.SendToUser(event.UserID, writeEvent("server:removed", event))
	h.RevalidateServer(event.ServerID)
}

func (h *Hub) PublishRoleCreate(event role.RoleEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("role:create", event))
}

func (h *Hub) PublishRoleUpdate(event role.RoleEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("role:update", event))
}

func (h *Hub) PublishRoleDelete(event role.DeleteEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("role:delete", event))
}

func (h *Hub) PublishRoleReorder(event role.ReorderEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("role:reorder", event))
}

func (h *Hub) PublishMemberRoles(event role.MemberRolesEvent) {
	h.BroadcastToRoom("server:"+event.ServerID, writeEvent("server:member:roles", event))
}

// PublishPermissionsChanged: cargos, cargos de membros ou sobrescritas de
// canal mudaram. O app busca os canais de novo; quem perdeu acesso sai das
// salas; as chamadas de voz são reajustadas (hook).
func (h *Hub) PublishPermissionsChanged(serverID string) {
	h.RevalidateServer(serverID)
	h.BroadcastToRoom("server:"+serverID, writeEvent("server:permissions:invalidate", map[string]string{
		"server_id": serverID,
	}))

	h.mu.RLock()
	hook := h.onPermsChanged
	h.mu.RUnlock()
	if hook != nil {
		go hook(serverID)
	}
}

// O server.Service avisa do link novo por aqui (type assertion no publisher).
var _ server.InviteCodePublisher = (*Hub)(nil)

// PublishInviteCode: o link de convite do servidor mudou ("Gerar novo link").
// Só quem pode convidar (CREATE_INVITE) recebe o código novo.
func (h *Hub) PublishInviteCode(serverID, code string) {
	snap := h.snapshot(serverID)
	if snap == nil {
		return
	}
	h.BroadcastToRoomFiltered("server:"+serverID, writeEvent("server:invite_code", map[string]string{
		"server_id": serverID,
		"code":      code,
	}), func(userID string) bool {
		return permission.Has(snap.Server(userID), permission.CreateInvite)
	})
}

// SendToUser delivers an event directly to every connection of a user
// (room "user:<id>"). No-op if the user is offline.
func (h *Hub) SendToUser(userID string, event []byte) {
	h.BroadcastToRoom("user:"+userID, event)
}

// BroadcastToCall broadcasts an event to the call room "call:<id>".
func (h *Hub) BroadcastToCall(callID string, event []byte) {
	h.BroadcastToRoom("call:"+callID, event)
}

func (h *Hub) PublishFriendRequest(recipientID string, requester *user.User) {
	h.publishFriendEvent("friend:request", recipientID, requester)
}

func (h *Hub) PublishFriendAccepted(requesterID string, friend *user.User) {
	h.publishFriendEvent("friend:request:accepted", requesterID, friend)
}

func (h *Hub) PublishFriendDeclined(requesterID string, declined *user.User) {
	h.publishFriendEvent("friend:request:declined", requesterID, declined)
}

func (h *Hub) PublishFriendCancelled(recipientID string, requester *user.User) {
	h.publishFriendEvent("friend:request:cancelled", recipientID, requester)
}

func (h *Hub) PublishFriendRemoved(recipientID string, removed *user.User) {
	h.publishFriendEvent("friend:removed", recipientID, removed)
}

func (h *Hub) PublishUserBlocked(blockerID string, blocked *user.User) {
	h.publishFriendEvent("relationship:blocked", blockerID, blocked)
}

func (h *Hub) PublishUserUnblocked(blockerID string, unblocked *user.User) {
	h.publishFriendEvent("relationship:unblocked", blockerID, unblocked)
}

// PublishConversationEvent avisa cada participante (sala user:<id>) que a
// conversa foi criada/alterada/removida/lida; o app recarrega o que precisa.
func (h *Hub) PublishConversationEvent(eventType string, conversationID string, userIDs []string) {
	event := writeEvent(eventType, map[string]string{"conversation_id": conversationID})
	for _, userID := range userIDs {
		if userID != "" {
			h.BroadcastToRoom("user:"+userID, event)
		}
	}
}

func (h *Hub) publishFriendEvent(eventType string, recipientID string, target *user.User) {
	if recipientID == "" || target == nil {
		return
	}
	h.BroadcastToRoom("user:"+recipientID, writeEvent(eventType, map[string]interface{}{
		"user_id": target.ID,
		"user":    target,
	}))
}
