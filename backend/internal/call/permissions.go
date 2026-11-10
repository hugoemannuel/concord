package call

import (
	"context"
	"errors"
	"log"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/livekit"
)

var (
	ErrNoConnect         = errors.New("você não tem permissão para entrar neste canal de voz")
	ErrCannotActOnMember = errors.New("você não pode fazer isso com alguém de cargo igual ou acima do seu")
	ErrTargetNotInCall   = errors.New("essa pessoa não está nesta chamada")
	ErrNotChannelCall    = errors.New("isso só vale para canais de voz de servidor")
	ErrTargetCannotJoin  = errors.New("essa pessoa não tem permissão para entrar no canal de destino")
	ErrMissingPermission = permission.ErrMissingPermission
)

// PermissionSource é o que a chamada usa do permission.Service.
type PermissionSource interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
	ChannelPerms(ctx context.Context, channelID, userID string) (int64, error)
}

// MediaAdmin muda permissões e desconecta gente no LiveKit (livekit.Admin).
type MediaAdmin interface {
	UpdatePermissions(ctx context.Context, room, identity string, g livekit.Grant) error
	Remove(ctx context.Context, room, identity string) error
}

// SetPermissions liga as permissões de servidor às chamadas de canal.
func (s *Service) SetPermissions(p PermissionSource) { s.perms = p }

// SetMediaAdmin liga a administração da mídia (silenciar/desconectar no servidor).
func (s *Service) SetMediaAdmin(a MediaAdmin) { s.media = a }

// grantFor traduz as permissões do canal (e o estado imposto pelo servidor)
// no que o participante pode publicar e ouvir. Sem SPEAK o microfone fica
// fechado; sem STREAM, câmera e tela.
func grantFor(perms int64, serverMuted, serverDeafened bool) livekit.Grant {
	return livekit.Grant{
		NoSpeak:     serverMuted || !permission.Has(perms, permission.Speak),
		NoStream:    !permission.Has(perms, permission.Stream),
		NoSubscribe: serverDeafened,
	}
}

// requireConnect confere VIEW + CONNECT no canal de voz. Sem permissão de
// permissões configurada, ninguém entra (falha fechada).
func (s *Service) requireConnect(ctx context.Context, channelID, userID string) error {
	if s.perms == nil {
		return ErrNotMember
	}
	perms, err := s.channelPerms(ctx, channelID, userID)
	switch {
	case err != nil:
		return ErrNotMember
	case !permission.Has(perms, permission.ViewChannel|permission.Connect):
		return ErrNoConnect
	}
	return nil
}

// CanViewChannel: o usuário vê o canal (para listar quem está nele).
func (s *Service) CanViewChannel(ctx context.Context, channelID, userID string) bool {
	if s.perms == nil {
		return false
	}
	perms, err := s.perms.ChannelPerms(ctx, channelID, userID)
	return err == nil && permission.Has(perms, permission.ViewChannel)
}

// VisibleStates tira da lista as chamadas de canais que o usuário não vê.
func (s *Service) VisibleStates(ctx context.Context, serverID, userID string, states []*StateResponse) []*StateResponse {
	if s.perms == nil {
		return []*StateResponse{}
	}
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return []*StateResponse{}
	}
	visible := make([]*StateResponse, 0, len(states))
	for _, st := range states {
		if st.Call != nil && st.Call.ChannelID != nil && snap.CanView(*st.Call.ChannelID, userID) {
			visible = append(visible, st)
		}
	}
	return visible
}

// GrantFor é o que o participante pode fazer na mídia da chamada. DM e quem
// não é participante recebem o grant completo (o token só sai para
// participantes de qualquer forma).
func (s *Service) GrantFor(ctx context.Context, callID, userID string) livekit.Grant {
	s.mu.RLock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Type != TypeChannel || ac.info.ChannelID == nil {
		s.mu.RUnlock()
		return livekit.Grant{}
	}
	channelID := *ac.info.ChannelID
	var serverMuted, serverDeafened bool
	if p, ok := ac.participants[userID]; ok {
		serverMuted, serverDeafened = p.serverMuted, p.serverDeafened
	}
	s.mu.RUnlock()

	if s.perms == nil {
		return grantFor(0, serverMuted, serverDeafened)
	}
	perms, err := s.channelPerms(ctx, channelID, userID)
	if err != nil {
		perms = 0
	}
	return grantFor(perms, serverMuted, serverDeafened)
}

// channelCall devolve a chamada de canal e quem está nela, ou erro.
func (s *Service) channelCall(callID string) (channelID, serverID string, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ac, ok := s.calls[callID]
	if !ok || ac.info.Status == StatusEnded {
		return "", "", ErrNotFound
	}
	if ac.info.Type != TypeChannel || ac.info.ChannelID == nil || ac.info.ServerID == nil {
		return "", "", ErrNotChannelCall
	}
	return *ac.info.ChannelID, *ac.info.ServerID, nil
}

// authorizeAction confere que o ator tem want no canal da chamada e está acima
// do alvo, e que o alvo está na chamada.
func (s *Service) authorizeAction(ctx context.Context, callID, actorID, targetID string, want int64) (channelID string, snap *permission.Snapshot, err error) {
	channelID, serverID, err := s.channelCall(callID)
	if err != nil {
		return "", nil, err
	}
	if s.perms == nil {
		return "", nil, ErrMissingPermission
	}
	snap, err = s.perms.Snapshot(ctx, serverID)
	if err != nil || !snap.IsMember(actorID) {
		return "", nil, ErrNotMember
	}
	if !permission.Has(snap.Channel(channelID, actorID), want) {
		return "", nil, ErrMissingPermission
	}
	if !s.IsParticipant(callID, targetID) {
		return "", nil, ErrTargetNotInCall
	}
	if !snap.CanActOn(actorID, targetID) {
		return "", nil, ErrCannotActOnMember
	}
	return channelID, snap, nil
}

// SetServerMute silencia (ou libera) alguém no servidor: ele não consegue
// publicar o microfone até um moderador liberar.
func (s *Service) SetServerMute(ctx context.Context, callID, actorID, targetID string, muted bool) error {
	return s.setServerVoice(ctx, callID, actorID, targetID, permission.MuteMembers, func(p *participantState) { p.serverMuted = muted })
}

// SetServerDeafen ensurdece (ou libera) alguém no servidor: ele não recebe
// áudio de ninguém.
func (s *Service) SetServerDeafen(ctx context.Context, callID, actorID, targetID string, deafened bool) error {
	return s.setServerVoice(ctx, callID, actorID, targetID, permission.DeafenMembers, func(p *participantState) { p.serverDeafened = deafened })
}

func (s *Service) setServerVoice(ctx context.Context, callID, actorID, targetID string, want int64, apply func(*participantState)) error {
	channelID, snap, err := s.authorizeAction(ctx, callID, actorID, targetID, want)
	if err != nil {
		return err
	}

	s.mu.Lock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.Unlock()
		return ErrNotFound
	}
	p, ok := ac.participants[targetID]
	if !ok {
		s.mu.Unlock()
		return ErrTargetNotInCall
	}
	apply(p)
	serverMuted, serverDeafened := p.serverMuted, p.serverDeafened
	s.mu.Unlock()

	// Fica no banco como o mudo normal: o reinício (deploy) recarrega.
	s.saveServerVoiceState(callID, targetID, serverMuted, serverDeafened)

	if s.media != nil {
		grant := grantFor(s.permsIn(ctx, snap, channelID, targetID), serverMuted, serverDeafened)
		if err := s.media.UpdatePermissions(ctx, callID, targetID, grant); err != nil {
			log.Printf("[call] update media permissions of %s in %s failed: %v", targetID, callID, err)
		}
	}
	s.publishVoice(callID, targetID)
	return nil
}

// DisconnectParticipant tira alguém da chamada (DISCONNECT_MEMBERS + hierarquia: mesmo nível ou menor).
func (s *Service) DisconnectParticipant(ctx context.Context, callID, actorID, targetID string) error {
	channelID, serverID, err := s.channelCall(callID)
	if err != nil {
		return err
	}
	if s.perms == nil {
		return ErrMissingPermission
	}
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil || !snap.IsMember(actorID) {
		return ErrNotMember
	}
	if !permission.Has(snap.Channel(channelID, actorID), permission.DisconnectMembers) {
		return ErrMissingPermission
	}
	if !s.IsParticipant(callID, targetID) {
		return ErrTargetNotInCall
	}
	if !snap.CanDisconnectMember(actorID, targetID) {
		return ErrCannotActOnMember
	}
	return s.kick(ctx, callID, targetID)
}

// kick desconecta da mídia e tira da chamada.
func (s *Service) kick(ctx context.Context, callID, userID string) error {
	if s.media != nil {
		if err := s.media.Remove(ctx, callID, userID); err != nil {
			log.Printf("[call] remove %s from media room %s failed: %v", userID, callID, err)
		}
	}
	return s.leaveCall(ctx, callID, userID)
}

// publishVoice reenvia o estado de voz do participante (mudo/ensurdecido do
// próprio e do servidor) para a chamada e para o servidor.
func (s *Service) publishVoice(callID, userID string) {
	s.mu.RLock()
	ac, ok := s.calls[callID]
	if !ok {
		s.mu.RUnlock()
		return
	}
	p, ok := ac.participants[userID]
	if !ok {
		s.mu.RUnlock()
		return
	}
	var serverID string
	if ac.info.ServerID != nil {
		serverID = *ac.info.ServerID
	}
	channelID := ac.info.ChannelID
	event := marshalEvent("call:voice", VoiceEvent{
		CallID:         callID,
		ChannelID:      ac.info.ChannelID,
		UserID:         userID,
		Muted:          p.muted,
		Deafened:       p.deafened,
		ServerMuted:    p.serverMuted,
		ServerDeafened: p.serverDeafened,
	})
	s.mu.RUnlock()

	s.publisher.BroadcastToCall(callID, event)
	if serverID != "" {
		s.broadcastServer(serverID, channelID, event)
	}
}

// voiceCallsOf lista as chamadas de canal ativas do servidor com os
// participantes de cada uma.
func (s *Service) voiceCallsOf(serverID string) map[string]voiceCall {
	s.mu.RLock()
	defer s.mu.RUnlock()
	calls := map[string]voiceCall{}
	for id, ac := range s.calls {
		if ac.info.Type != TypeChannel || ac.info.Status == StatusEnded || ac.info.ServerID == nil ||
			*ac.info.ServerID != serverID || ac.info.ChannelID == nil {
			continue
		}
		vc := voiceCall{channelID: *ac.info.ChannelID, participants: map[string]participantFlags{}}
		for uid, p := range ac.participants {
			vc.participants[uid] = participantFlags{serverMuted: p.serverMuted, serverDeafened: p.serverDeafened}
		}
		calls[id] = vc
	}
	return calls
}

type participantFlags struct{ serverMuted, serverDeafened bool }

type voiceCall struct {
	channelID    string
	participants map[string]participantFlags
}

// RevalidateServer reaplica as permissões a quem está em chamadas de voz do
// servidor depois de uma mudança de cargos ou canais: quem perdeu acesso ao
// canal sai da chamada; quem perdeu falar ou transmitir tem a mídia atualizada
// na hora.
func (s *Service) RevalidateServer(ctx context.Context, serverID string) {
	if s.perms == nil {
		return
	}
	calls := s.voiceCallsOf(serverID)
	if len(calls) == 0 {
		return
	}
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return
	}
	for callID, vc := range calls {
		for userID, flags := range vc.participants {
			s.revalidateParticipant(ctx, snap, callID, vc.channelID, userID, flags)
		}
	}
}

// revalidateParticipant: sem acesso ao canal, sai da chamada; com acesso, a
// mídia passa a refletir o que ele pode agora.
func (s *Service) revalidateParticipant(ctx context.Context, snap *permission.Snapshot, callID, channelID, userID string, flags participantFlags) {
	perms := s.permsIn(ctx, snap, channelID, userID)
	if !permission.Has(perms, permission.ViewChannel|permission.Connect) {
		if err := s.kick(ctx, callID, userID); err != nil {
			log.Printf("[call] revalidate: remove %s from %s failed: %v", userID, callID, err)
		}
		return
	}
	if s.media == nil {
		return
	}
	grant := grantFor(perms, flags.serverMuted, flags.serverDeafened)
	if err := s.media.UpdatePermissions(ctx, callID, userID, grant); err != nil {
		log.Printf("[call] revalidate: update %s in %s failed: %v", userID, callID, err)
	}
	dropScreenWithoutStream(ctx, s.media, callID, userID, grant)
}

// RemoveFromServerCalls tira o usuário das chamadas de voz do servidor
// (expulso, banido ou saiu).
func (s *Service) RemoveFromServerCalls(ctx context.Context, serverID, userID string) {
	for callID, vc := range s.voiceCallsOf(serverID) {
		if _, in := vc.participants[userID]; !in {
			continue
		}
		if err := s.kick(ctx, callID, userID); err != nil {
			log.Printf("[call] remove %s from %s failed: %v", userID, callID, err)
		}
	}
}

// ChannelPublisher é o publicador que sabe entregar só a quem vê o canal (o
// hub). Sem ele, cai no broadcast para o servidor inteiro.
type ChannelPublisher interface {
	BroadcastToServerChannel(serverID, channelID string, event []byte)
}

// broadcastServer avisa a sala do servidor. Eventos de um canal de voz vão só
// para quem vê o canal (canal privado não vaza quem está nele).
func (s *Service) broadcastServer(serverID string, channelID *string, event []byte) {
	if cp, ok := s.publisher.(ChannelPublisher); ok && channelID != nil {
		cp.BroadcastToServerChannel(serverID, *channelID, event)
		return
	}
	s.publisher.BroadcastToRoom("server:"+serverID, event)
}
