package call

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/conversation"

	"github.com/google/uuid"
)

// Começar uma chamada de DM 1:1. Extraído do service.go (god service) e quebrado em passos pequenos.

// dmCalleeOf: quem é chamado numa DM 1:1. Grupo, quem não é da conversa e o Salinha Bot (só leitura) não ligam.
func dmCalleeOf(conv *conversation.Conversation, initiatorID string) (string, error) {
	if conv.IsGroup() || (conv.UserAID != initiatorID && conv.UserBID != initiatorID) {
		return "", ErrNotParticipant
	}
	calleeID := conv.UserAID
	if initiatorID == conv.UserAID {
		calleeID = conv.UserBID
	}
	if bot.IsBot(calleeID) {
		return "", ErrNotParticipant
	}
	return calleeID, nil
}

// checkDMCallable: bloqueio entre os dois e se o chamado pode ser avisado (online ou com push).
func (s *Service) checkDMCallable(ctx context.Context, initiatorID, calleeID string) error {
	if s.blockedCheck != nil {
		if blocked, err := s.blockedCheck(ctx, initiatorID, calleeID); err != nil || blocked {
			return ErrBlocked
		}
	}
	if !s.calleeReachable(calleeID) {
		return ErrCalleeOffline
	}
	return nil
}

// reserveDMLocked (com s.mu travado) decide se dá para começar: devolve a chamada que já existe nessa conversa,
// ErrBusy se quem liga está em outra chamada, ou (nil, nil) quando está livre. O chamado em
// outra chamada não impede: a DM toca para ele (switchCallerForDM).
func (s *Service) reserveDMLocked(initiatorID, conversationID string) (*Call, error) {
	if callID, ok := s.busy[initiatorID]; ok {
		existing := s.calls[callID]
		if existing != nil && existing.info.ConversationID != nil && *existing.info.ConversationID == conversationID {
			return existing.info, nil
		}
		return nil, ErrBusy
	}
	if existing := s.findActiveByScopeLocked(TypeDM, conversationID); existing != nil {
		return existing.info, nil
	}
	return nil, nil
}

// newRingingDM monta a chamada tocando, só com quem ligou dentro.
func newRingingDM(conversationID, initiatorID, calleeID string, now time.Time) *activeCall {
	call := &Call{
		ID:             uuid.New().String(),
		Type:           TypeDM,
		ConversationID: &conversationID,
		InitiatorID:    initiatorID,
		Status:         StatusRinging,
	}
	ac := &activeCall{
		info:         call,
		participants: make(map[string]*participantState),
		inviteeID:    calleeID,
	}
	ac.participants[initiatorID] = &participantState{userID: initiatorID, role: RoleMember, joinedAt: now}
	return ac
}

// persistNewDM grava a chamada e quem ligou; falha de banco só vai para o log (a chamada vive em memória).
func (s *Service) persistNewDM(ctx context.Context, call *Call) {
	if s.repository != nil {
		if err := s.repository.Create(ctx, call); err != nil {
			log.Printf("[call] persist call %s failed: %v", call.ID, err)
		}
	}
	err := s.addParticipant(ctx, &CallParticipant{CallID: call.ID, UserID: call.InitiatorID, Role: RoleMember})
	if err != nil {
		log.Printf("[call] persist participant %s failed: %v", call.InitiatorID, err)
	}
}

// announceDM avisa o chamado (convite), quem ligou (tocando), os observadores (push) e agenda o limite de toque.
func (s *Service) announceDM(call *Call, calleeID string, initiator, callee UserInfo) {
	s.publisher.SendToUser(calleeID, marshalEvent("call:invite", InviteEvent{
		CallID:         call.ID,
		Type:           call.Type,
		Initiator:      initiator,
		ConversationID: call.ConversationID,
	}))
	s.publisher.SendToUser(call.InitiatorID, marshalEvent("call:ring", RingEvent{CallID: call.ID, Callee: callee}))
	s.notifyDMInvite(DMInvite{CallID: call.ID, ConversationID: *call.ConversationID, CalleeID: calleeID, InitiatorName: initiator.DisplayName})
	s.scheduleRingTimeout(call.ID)
}

func (s *Service) StartDM(ctx context.Context, initiatorID string, conversationID string) (*Call, error) {
	conv, err := s.findConversation(ctx, conversationID)
	if err != nil {
		return nil, ErrNotFound
	}
	calleeID, err := dmCalleeOf(conv, initiatorID)
	if err != nil {
		return nil, err
	}
	if err := s.checkDMCallable(ctx, initiatorID, calleeID); err != nil {
		return nil, err
	}
	if err := s.switchCallerForDM(ctx, initiatorID, calleeID, conv.ID); err != nil {
		return nil, err
	}
	return s.createDM(ctx, conv.ID, initiatorID, calleeID)
}

// createDM reserva os dois lados e cria a chamada tocando.
func (s *Service) createDM(ctx context.Context, conversationID, initiatorID, calleeID string) (*Call, error) {
	s.mu.Lock()
	existing, err := s.reserveDMLocked(initiatorID, conversationID)
	if existing != nil || err != nil {
		s.mu.Unlock()
		return existing, err
	}
	initiator, err := s.lookupUser(ctx, initiatorID)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	callee, err := s.lookupUser(ctx, calleeID)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	ac := newRingingDM(conversationID, initiatorID, calleeID, time.Now())
	s.calls[ac.info.ID] = ac
	s.busy[initiatorID] = ac.info.ID
	s.mu.Unlock()

	s.persistNewDM(ctx, ac.info)
	s.announceDM(ac.info, calleeID, initiator, callee)
	return ac.info, nil
}
