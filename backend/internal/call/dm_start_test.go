package call

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/conversation"
)

func dmConv(a, b string) *conversation.Conversation {
	return &conversation.Conversation{ID: "cv-1", Type: conversation.TypeDM, UserAID: a, UserBID: b}
}

func TestDMCalleeOf(t *testing.T) {
	t.Run("o outro lado da DM é o chamado", func(t *testing.T) {
		if id, err := dmCalleeOf(dmConv("ana", "bia"), "ana"); err != nil || id != "bia" {
			t.Fatalf("id=%q err=%v", id, err)
		}
		if id, err := dmCalleeOf(dmConv("ana", "bia"), "bia"); err != nil || id != "ana" {
			t.Fatalf("id=%q err=%v", id, err)
		}
	})

	t.Run("grupo não liga", func(t *testing.T) {
		group := &conversation.Conversation{ID: "g", Type: conversation.TypeGroup}
		if _, err := dmCalleeOf(group, "ana"); !errors.Is(err, ErrNotParticipant) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("quem não é da conversa não liga", func(t *testing.T) {
		if _, err := dmCalleeOf(dmConv("ana", "bia"), "intruso"); !errors.Is(err, ErrNotParticipant) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("DM com bot é só leitura", func(t *testing.T) {
		if _, err := dmCalleeOf(dmConv("ana", bot.SalinhaBotID), "ana"); !errors.Is(err, ErrNotParticipant) {
			t.Fatalf("err=%v", err)
		}
	})
}

func TestCheckDMCallable(t *testing.T) {
	ctx := context.Background()
	online := func(ids ...string) func(string) bool {
		set := map[string]bool{}
		for _, id := range ids {
			set[id] = true
		}
		return func(id string) bool { return set[id] }
	}

	t.Run("bloqueado ou erro na checagem recusa", func(t *testing.T) {
		s := serviceWithCall("x")
		s.blockedCheck = func(context.Context, string, string) (bool, error) { return true, nil }
		if err := s.checkDMCallable(ctx, "ana", "bia"); !errors.Is(err, ErrBlocked) {
			t.Fatalf("err=%v", err)
		}
		s.blockedCheck = func(context.Context, string, string) (bool, error) { return false, errors.New("banco") }
		if err := s.checkDMCallable(ctx, "ana", "bia"); !errors.Is(err, ErrBlocked) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("offline sem push recusa; online ou com push passa", func(t *testing.T) {
		s := serviceWithCall("x")
		s.isOnline = online("bia")
		if err := s.checkDMCallable(ctx, "ana", "caio"); !errors.Is(err, ErrCalleeOffline) {
			t.Fatalf("err=%v", err)
		}
		if err := s.checkDMCallable(ctx, "ana", "bia"); err != nil {
			t.Fatalf("online deveria passar: %v", err)
		}
		s.SetOfflineRinger(func(id string) bool { return id == "caio" })
		if err := s.checkDMCallable(ctx, "ana", "caio"); err != nil {
			t.Fatalf("com push deveria passar: %v", err)
		}
	})
}

func TestReserveDMLocked(t *testing.T) {
	t.Run("livre devolve nada", func(t *testing.T) {
		s := serviceWithCall("x")
		if call, err := s.reserveDMLocked("ana", "cv-1"); call != nil || err != nil {
			t.Fatalf("call=%v err=%v", call, err)
		}
	})

	t.Run("quem liga ocupado em outra chamada: ocupado", func(t *testing.T) {
		s := serviceWithCall("call-1", "ana")
		s.busy["ana"] = "call-1"
		if _, err := s.reserveDMLocked("ana", "cv-1"); !errors.Is(err, ErrBusy) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("ligar de novo na mesma conversa devolve a chamada que já existe", func(t *testing.T) {
		s := serviceWithCall("call-1", "ana")
		convID := "cv-1"
		s.calls["call-1"].info.ConversationID = &convID
		s.busy["ana"] = "call-1"
		call, err := s.reserveDMLocked("ana", "cv-1")
		if err != nil || call == nil || call.ID != "call-1" {
			t.Fatalf("call=%v err=%v", call, err)
		}
	})

	t.Run("chamado em outra chamada: livre para tocar", func(t *testing.T) {
		s := serviceWithCall("x")
		s.busy["bia"] = "outra"
		if call, err := s.reserveDMLocked("ana", "cv-1"); call != nil || err != nil {
			t.Fatalf("call=%v err=%v", call, err)
		}
	})

	t.Run("já há chamada ativa de DM nessa conversa: devolve ela", func(t *testing.T) {
		s := serviceWithCall("call-1")
		convID := "cv-1"
		s.calls["call-1"].info.Type = TypeDM
		s.calls["call-1"].info.ConversationID = &convID
		call, err := s.reserveDMLocked("ana", "cv-1")
		if err != nil || call == nil || call.ID != "call-1" {
			t.Fatalf("call=%v err=%v", call, err)
		}
	})
}

func TestNewRingingDM(t *testing.T) {
	now := time.Now()
	ac := newRingingDM("cv-1", "ana", "bia", now)
	if ac.info.Status != StatusRinging || ac.info.Type != TypeDM || ac.inviteeID != "bia" || *ac.info.ConversationID != "cv-1" {
		t.Fatalf("chamada = %+v", ac.info)
	}
	if len(ac.participants) != 1 || ac.participants["ana"] == nil || !ac.participants["ana"].joinedAt.Equal(now) {
		t.Fatalf("participantes = %+v", ac.participants)
	}
	if other := newRingingDM("cv-1", "ana", "bia", now); other.info.ID == ac.info.ID {
		t.Fatal("cada chamada tem id próprio")
	}
}

func TestCreateDM(t *testing.T) {
	ctx := context.Background()
	rig := func() (*Service, *fakePublisher) {
		pub := &fakePublisher{}
		s := serviceWithCall("x")
		s.publisher = pub
		s.lookupUser = func(_ context.Context, id string) (UserInfo, error) {
			return UserInfo{ID: id, Username: id, DisplayName: "Nome " + id}, nil
		}
		s.ringTimeout = time.Hour
		return s, pub
	}

	t.Run("cria a chamada tocando, convida o chamado e avisa quem observa", func(t *testing.T) {
		s, pub := rig()
		var invites []DMInvite
		s.OnDMInvite(func(i DMInvite) { invites = append(invites, i) })
		call, err := s.createDM(ctx, "cv-1", "ana", "bia")
		if err != nil || call == nil {
			t.Fatalf("call=%v err=%v", call, err)
		}
		if s.busy["ana"] != call.ID || s.calls[call.ID] == nil {
			t.Fatal("a chamada deveria estar em memória e quem ligou ocupado")
		}
		if len(pub.eventsOf("call:invite")) != 1 || len(pub.eventsOf("call:ring")) != 1 {
			t.Fatalf("eventos: invite=%d ring=%d", len(pub.eventsOf("call:invite")), len(pub.eventsOf("call:ring")))
		}
		if pub.eventsOf("call:invite")[0].target != "user:bia" || pub.eventsOf("call:ring")[0].target != "user:ana" {
			t.Fatal("convite vai para o chamado e o toque para quem ligou")
		}
		if len(invites) != 1 || invites[0].InitiatorName != "Nome ana" || invites[0].CalleeID != "bia" {
			t.Fatalf("convite observado = %+v", invites)
		}
	})

	t.Run("chamado em outra chamada recebe o convite", func(t *testing.T) {
		s, pub := rig()
		s.busy["bia"] = "outra"
		call, err := s.createDM(ctx, "cv-1", "ana", "bia")
		if err != nil || call == nil {
			t.Fatalf("call=%v err=%v", call, err)
		}
		if invites := pub.eventsOf("call:invite"); len(invites) != 1 || invites[0].target != "user:bia" {
			t.Fatalf("convite = %+v", invites)
		}
	})

	t.Run("quem liga ocupado não cria nada", func(t *testing.T) {
		s, pub := rig()
		s.busy["ana"] = "outra"
		if _, err := s.createDM(ctx, "cv-1", "ana", "bia"); !errors.Is(err, ErrBusy) {
			t.Fatalf("err=%v", err)
		}
		if len(pub.sent) != 0 {
			t.Fatal("nada deveria ser publicado")
		}
	})

	t.Run("falha ao buscar os dados de quem liga ou de quem recebe desfaz a reserva", func(t *testing.T) {
		for _, failing := range []string{"ana", "bia"} {
			s, _ := rig()
			s.lookupUser = func(_ context.Context, id string) (UserInfo, error) {
				if id == failing {
					return UserInfo{}, errors.New("banco fora")
				}
				return UserInfo{ID: id}, nil
			}
			if _, err := s.createDM(ctx, "cv-1", "ana", "bia"); err == nil {
				t.Fatalf("esperava erro quando %s falha", failing)
			}
			if len(s.busy) != 0 {
				t.Fatal("ninguém deveria ficar ocupado")
			}
		}
	})
}

func TestStartDM(t *testing.T) {
	ctx := context.Background()
	rig := func(conv *conversation.Conversation, convErr error) (*Service, *fakePublisher) {
		pub := &fakePublisher{}
		s := serviceWithCall("x")
		s.publisher = pub
		s.findConversation = func(context.Context, string) (*conversation.Conversation, error) { return conv, convErr }
		s.lookupUser = func(_ context.Context, id string) (UserInfo, error) { return UserInfo{ID: id, DisplayName: id}, nil }
		s.isOnline = func(string) bool { return true }
		s.ringTimeout = time.Hour
		return s, pub
	}

	t.Run("conversa que não existe", func(t *testing.T) {
		s, _ := rig(nil, errors.New("sem linhas"))
		if _, err := s.StartDM(ctx, "ana", "cv-1"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("quem não é da conversa não liga", func(t *testing.T) {
		s, _ := rig(dmConv("ana", "bia"), nil)
		if _, err := s.StartDM(ctx, "intruso", "cv-1"); !errors.Is(err, ErrNotParticipant) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("chamado offline sem push é recusado", func(t *testing.T) {
		s, _ := rig(dmConv("ana", "bia"), nil)
		s.isOnline = func(string) bool { return false }
		if _, err := s.StartDM(ctx, "ana", "cv-1"); !errors.Is(err, ErrCalleeOffline) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("chamado offline com push recebe a chamada tocando", func(t *testing.T) {
		s, pub := rig(dmConv("ana", "bia"), nil)
		s.isOnline = func(string) bool { return false }
		s.SetOfflineRinger(func(id string) bool { return id == "bia" })
		call, err := s.StartDM(ctx, "ana", "cv-1")
		if err != nil || call == nil || call.Status != StatusRinging {
			t.Fatalf("call=%v err=%v", call, err)
		}
		if len(pub.eventsOf("call:invite")) != 1 {
			t.Fatal("o convite deveria ter sido publicado")
		}
	})
}
