package call

import (
	"context"
	"errors"
	"log"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

var (
	ErrNotModerator    = errors.New("só moderadores podem mover pessoas entre canais de voz")
	ErrNotInVoice      = errors.New("essa pessoa não está em um canal de voz deste servidor")
	ErrSameChannel     = errors.New("essa pessoa já está nesse canal")
	ErrNotVoiceChannel = errors.New("o destino precisa ser um canal de voz")
)

// MovedEvent avisa quem foi movido (o cliente dele troca de sala sozinho) e
// o servidor (listas dos canais de voz).
type MovedEvent struct {
	CallID        string   `json:"call_id"`
	FromCallID    string   `json:"from_call_id"`
	FromChannelID string   `json:"from_channel_id"`
	ChannelID     string   `json:"channel_id"`
	ChannelName   string   `json:"channel_name"`
	ServerID      string   `json:"server_id"`
	User          UserInfo `json:"user"`
	MovedBy       UserInfo `json:"moved_by"`
}

// voiceLocation é onde alguém está conectado num canal de voz.
type voiceLocation struct {
	callID    string
	channelID string
	serverID  string
}

// voiceLocationOf diz em qual canal de voz o usuário está (ok=false se não
// estiver em nenhum, ou se estiver numa DM).
func (s *Service) voiceLocationOf(userID string) (voiceLocation, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	callID, ok := s.busy[userID]
	if !ok {
		return voiceLocation{}, false
	}
	ac, ok := s.calls[callID]
	if !ok || ac.info.Type != TypeChannel || ac.info.ChannelID == nil || ac.info.ServerID == nil {
		return voiceLocation{}, false
	}
	if _, in := ac.participants[userID]; !in {
		return voiceLocation{}, false
	}
	return voiceLocation{callID: callID, channelID: *ac.info.ChannelID, serverID: *ac.info.ServerID}, true
}

// VoiceLocation é onde alguém está num canal de voz (usado pelo bot de música).
type VoiceLocation struct {
	CallID    string
	ChannelID string
	ServerID  string
}

func (s *Service) VoiceLocationOf(userID string) (VoiceLocation, bool) {
	loc, ok := s.voiceLocationOf(userID)
	return VoiceLocation{CallID: loc.callID, ChannelID: loc.channelID, ServerID: loc.serverID}, ok
}

// checkMove aplica as regras de quem pode mover e para onde.
func checkMove(actorIsModerator bool, from voiceLocation, inVoice bool, dest *channel.Channel) error {
	if dest.Type != channel.TypeVoice {
		return ErrNotVoiceChannel
	}
	if !inVoice || from.serverID != dest.ServerID {
		return ErrNotInVoice
	}
	if !actorIsModerator {
		return ErrNotModerator
	}
	if from.channelID == dest.ID {
		return ErrSameChannel
	}
	return nil
}

// authorizeMove junta as regras de mover: MOVE_MEMBERS no canal em que a
// pessoa está, ver o destino, cargo mais alto igual ou maior que o do alvo
// (sem imunidade especial do dono) e o destino deixar a pessoa entrar.
func authorizeMove(snap *permission.Snapshot, actorID, targetID string, from voiceLocation, inVoice bool, dest *channel.Channel) error {
	if !snap.CanView(dest.ID, actorID) {
		return ErrNotFound
	}
	canMove := inVoice && permission.Has(snap.Channel(from.channelID, actorID), permission.MoveMembers)
	if err := checkMove(canMove, from, inVoice, dest); err != nil {
		return err
	}
	if !snap.CanModerateVoice(actorID, targetID) {
		return ErrCannotActOnMember
	}
	// Visitante (não é membro): o acesso dele passa para o destino
	// (admitMovedGuest) e a entrada é conferida ao entrar na chamada.
	if snap.IsMember(targetID) && !permission.Has(snap.Channel(dest.ID, targetID), permission.ViewChannel|permission.Connect) {
		return ErrTargetCannotJoin
	}
	return nil
}

// MoveToChannel tira targetID do canal de voz em que está e o coloca em
// channelID. Exige MOVE_MEMBERS no canal em que a pessoa está, ver o canal
// de destino e cargo mais alto >= alvo; o destino precisa deixar a pessoa entrar (CONNECT).
func (s *Service) MoveToChannel(ctx context.Context, actorID, targetID, channelID string) (*Call, error) {
	dest, err := s.findChannel(ctx, channelID)
	if err != nil {
		return nil, ErrNotFound
	}
	// Mover é ação de moderador: passa mesmo por sala trancada.
	return s.moveTo(ctx, actorID, targetID, dest, func() (*Call, error) {
		return s.startChannel(ctx, targetID, dest.ID, true)
	})
}

// moveTo autoriza e faz a troca de canal; join põe a pessoa no destino
// (trocável nos testes, que não têm banco).
func (s *Service) moveTo(ctx context.Context, actorID, targetID string, dest *channel.Channel, join func() (*Call, error)) (*Call, error) {
	from, inVoice := s.voiceLocationOf(targetID)

	if s.perms == nil {
		return nil, ErrNotModerator
	}
	snap, err := s.perms.Snapshot(ctx, dest.ServerID)
	if err != nil || !snap.IsMember(actorID) {
		return nil, ErrNotFound
	}
	if err := authorizeMove(snap, actorID, targetID, from, inVoice, dest); err != nil {
		return nil, err
	}
	if err := s.admitMovedGuest(ctx, snap, targetID, dest); err != nil {
		return nil, err
	}

	s.leaveCallRoom(targetID, from.callID)
	if err := s.leaveCall(ctx, from.callID, targetID); err != nil {
		return nil, err
	}
	call, err := join()
	if err != nil {
		log.Printf("[call] move %s to %s failed after leaving: %v", targetID, dest.ID, err)
		return nil, err
	}
	s.announceMove(ctx, actorID, targetID, call, from, dest)
	return call, nil
}

// callRoomLeaver tira as conexões de alguém de uma sala do WS (o Hub).
type callRoomLeaver interface {
	UnsubscribeUser(userID, room string)
}

// leaveCallRoom tira quem vai ser movido da sala WS da chamada antiga antes
// de ele sair dela. Senão o call:left dele (e o call:ended, se estava
// sozinho) chegava antes do call:moved: o cliente largava a chamada (ou
// tentava voltar para ela) e ignorava o call:moved, ficando na lista do canal
// novo sem estar nele de fato (issue #368). Quem fica na sala antiga continua
// vendo a saída.
func (s *Service) leaveCallRoom(userID, callID string) {
	if r, ok := s.publisher.(callRoomLeaver); ok {
		r.UnsubscribeUser(userID, "call:"+callID)
	}
}

// announceMove avisa quem foi movido (o cliente dele troca de sala sozinho)
// e o servidor (listas dos canais de voz).
func (s *Service) announceMove(ctx context.Context, actorID, targetID string, call *Call, from voiceLocation, dest *channel.Channel) {
	targetInfo, err := s.lookupUser(ctx, targetID)
	if err != nil {
		return
	}
	actorInfo, _ := s.lookupUser(ctx, actorID)
	event := marshalEvent("call:moved", MovedEvent{
		CallID:        call.ID,
		FromCallID:    from.callID,
		FromChannelID: from.channelID,
		ChannelID:     dest.ID,
		ChannelName:   dest.Name,
		ServerID:      dest.ServerID,
		User:          targetInfo,
		MovedBy:       actorInfo,
	})
	s.publisher.SendToUser(targetID, event)
	s.broadcastServer(dest.ServerID, &dest.ID, event)
}
