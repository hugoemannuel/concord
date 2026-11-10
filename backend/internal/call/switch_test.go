package call

import (
	"context"
	"errors"
	"testing"
)

// leaveRecorder troca o leaveCall do serviço (sem banco) por um que registra
// quem saiu de onde e libera o "ocupado", como o Leave de verdade.
type leaveRecorder struct {
	calls    [][2]string
	keepBusy bool
	failWith error
}

func (r *leaveRecorder) install(s *Service) {
	s.leaveCall = func(_ context.Context, callID, userID string) error {
		r.calls = append(r.calls, [2]string{callID, userID})
		if r.failWith != nil {
			return r.failWith
		}
		if !r.keepBusy {
			s.mu.Lock()
			delete(s.busy, userID)
			if ac := s.calls[callID]; ac != nil {
				delete(ac.participants, userID)
			}
			s.mu.Unlock()
		}
		return nil
	}
}

func TestLeaveForSwitchSaiDaSalaAntesDeSair(t *testing.T) {
	s := serviceWithCall("canal", "ana")
	pub := newRoomPublisher()
	s.publisher = pub
	pub.join("call:canal", "ana", "caio")
	var roomWhenLeaving map[string]bool
	s.leaveCall = func(_ context.Context, callID, userID string) error {
		roomWhenLeaving = map[string]bool{}
		for id := range pub.members["call:"+callID] {
			roomWhenLeaving[id] = true
		}
		return nil
	}
	if err := s.leaveForSwitch(context.Background(), "ana", "canal"); err != nil {
		t.Fatalf("leaveForSwitch: %v", err)
	}
	if roomWhenLeaving["ana"] || !roomWhenLeaving["caio"] {
		t.Fatalf("ana deveria sair da sala WS antes de sair da call: %v", roomWhenLeaving)
	}
}

func TestSwitchCallerForDM(t *testing.T) {
	ctx := context.Background()

	t.Run("quem liga num canal sai dele", func(t *testing.T) {
		s := serviceWithCall("canal", "ana")
		s.busy["ana"] = "canal"
		rec := &leaveRecorder{}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "ana", "bia", "cv-1"); err != nil {
			t.Fatalf("err=%v", err)
		}
		if len(rec.calls) != 1 || rec.calls[0] != [2]string{"canal", "ana"} {
			t.Fatalf("saídas = %v", rec.calls)
		}
	})

	t.Run("quem liga já na DM desta conversa fica", func(t *testing.T) {
		s := serviceWithCall("call-1", "ana")
		conv := "cv-1"
		s.calls["call-1"].info.Type = TypeDM
		s.calls["call-1"].info.ConversationID = &conv
		s.busy["ana"] = "call-1"
		rec := &leaveRecorder{}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "ana", "bia", "cv-1"); err != nil {
			t.Fatalf("err=%v", err)
		}
		if len(rec.calls) != 0 {
			t.Fatalf("não deveria sair: %v", rec.calls)
		}
	})

	t.Run("chamado já tocando para outra DM: ocupado", func(t *testing.T) {
		s := ringingDM(&fakePublisher{}) // call-1: ana liga para bia
		s.busy["caio"] = "canal"
		rec := &leaveRecorder{}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "caio", "bia", "cv-2"); !errors.Is(err, ErrBusy) {
			t.Fatalf("err=%v", err)
		}
		if len(rec.calls) != 0 {
			t.Fatalf("ocupado não tira ninguém da call: %v", rec.calls)
		}
	})

	t.Run("ligar de novo na mesma conversa tocando não é ocupado", func(t *testing.T) {
		s := ringingDM(&fakePublisher{}) // call-1: ana liga para bia
		conv := "cv-1"
		s.calls["call-1"].info.ConversationID = &conv
		rec := &leaveRecorder{}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "ana", "bia", "cv-1"); err != nil || len(rec.calls) != 0 {
			t.Fatalf("err=%v saídas=%v", err, rec.calls)
		}
	})

	t.Run("livre não faz nada", func(t *testing.T) {
		s := serviceWithCall("x")
		rec := &leaveRecorder{}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "ana", "bia", "cv-1"); err != nil || len(rec.calls) != 0 {
			t.Fatalf("err=%v saídas=%v", err, rec.calls)
		}
	})

	t.Run("falha ao sair devolve o erro", func(t *testing.T) {
		s := serviceWithCall("canal", "ana")
		s.busy["ana"] = "canal"
		rec := &leaveRecorder{failWith: errors.New("banco")}
		rec.install(s)
		if err := s.switchCallerForDM(ctx, "ana", "bia", "cv-1"); err == nil {
			t.Fatal("esperava erro")
		}
	})
}
