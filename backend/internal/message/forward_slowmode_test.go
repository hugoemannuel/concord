package message

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

// Regressão: encaminhar para um canal com modo lento não gastava a vez, e dava
// para mandar quantas mensagens quisesse pelo encaminhamento.

// gatedComments: o comentário passa pelo modo lento, como no Service.
type gatedComments struct {
	fakeComments
	gate *Slowmode
}

func (c *gatedComments) CreateChannelMessage(ctx context.Context, channelID, authorID, content string, _ *string, _ []string, _ *string, _ *string, _ *GifMetadata) (*Message, error) {
	if _, err := c.gate.Take(ctx, channelID, authorID); err != nil {
		return nil, err
	}
	return c.record(Message{ID: "comentario", ChannelID: &channelID, AuthorID: authorID, Content: content})
}

func toSlowChannel(messageID string) ForwardRequest {
	return ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: messageID, UserID: "ana", Target: Room{ChannelID: "lento"}}
}

func slowForwardEnv(t *testing.T) (*forwardEnv, *Slowmode) {
	t.Helper()
	src := authored(channelMsg("m1", "bia", "oi"), "bia", "Bia")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	gate := newGate()
	env.f.slowmode = gate
	return env, gate
}

func TestForwardParaCanalNoModoLentoGastaAVez(t *testing.T) {
	env, _ := slowForwardEnv(t)
	if _, err := env.f.Forward(context.Background(), toSlowChannel("m1")); err != nil {
		t.Fatalf("1º Forward: %v", err)
	}
	_, err := env.f.Forward(context.Background(), toSlowChannel("m1"))
	if retryAfter(t, err) <= 0 || len(env.store.created) != 1 {
		t.Fatalf("2º Forward: err = %v, criadas = %d", err, len(env.store.created))
	}
}

func TestForwardQueFalhaDevolveAVez(t *testing.T) {
	env, gate := slowForwardEnv(t)
	env.store.createErr = errors.New("banco fora")
	if _, err := env.f.Forward(context.Background(), toSlowChannel("m1")); err == nil {
		t.Fatal("Forward deveria falhar")
	}
	if _, ok := gate.last[slowmodeKey{"lento", "ana"}]; ok {
		t.Fatal("encaminhamento que não saiu gastou a vez")
	}
}

// O comentário vai junto do encaminhamento na mesma vez (não é recusado) e a
// vez continua gasta depois dele.
func TestForwardComComentarioNoModoLentoUsaUmaVez(t *testing.T) {
	env, gate := slowForwardEnv(t)
	comments := &gatedComments{gate: gate}
	env.f.comments = comments
	req := toSlowChannel("m1")
	req.Comment = "vê isso"

	res, err := env.f.Forward(context.Background(), req)
	if err != nil || res.Comment == nil || len(comments.sent) != 1 {
		t.Fatalf("res = %+v, err = %v, comentários = %d", res, err, len(comments.sent))
	}
	if _, err := env.f.Forward(context.Background(), toSlowChannel("m1")); retryAfter(t, err) <= 0 {
		t.Fatalf("depois do comentário a vez deveria seguir gasta: %v", err)
	}
}

// Comentário que falha por outro motivo não devolve a vez do encaminhamento.
func TestForwardComentarioQueFalhaMantemAVez(t *testing.T) {
	env, gate := slowForwardEnv(t)
	env.f.comments = &fakeComments{err: errors.New("falhou")}
	req := toSlowChannel("m1")
	req.Comment = "vê"
	if _, err := env.f.Forward(context.Background(), req); err != nil {
		t.Fatalf("Forward: %v", err)
	}
	if _, ok := gate.last[slowmodeKey{"lento", "ana"}]; !ok {
		t.Fatal("a vez do encaminhamento sumiu")
	}
}

func TestForwardHandlerNoModoLentoE429(t *testing.T) {
	env, gate := slowForwardEnv(t)
	_, _ = gate.Take(context.Background(), "lento", "ana")
	rec := postJSON(forwardRouter(env, nil, "ana"), "/api/channels/geral/messages/m1/forward", map[string]string{"channel_id": "lento"})
	code, retry := slowmodeBody(t, rec)
	if rec.Code != http.StatusTooManyRequests || code != "slowmode" || retry != 30 {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

// Regressão: a enquete no canal com modo lento também não gastava a vez.
func TestCreateChannelPollNoModoLentoE429(t *testing.T) {
	gate := newGate()
	_, _ = gate.Take(context.Background(), "lento", "ana")
	raw := `{"question":"qual?","answers":[{"text":"a"},{"text":"b"}],"duration_hours":24}`
	rec := postRaw(slowmodeRouter(membro, gate), "/api/channels/lento/polls", raw)
	code, retry := slowmodeBody(t, rec)
	if rec.Code != http.StatusTooManyRequests || code != "slowmode" || retry != 30 {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}
