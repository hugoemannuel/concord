package push

import (
	"context"
	"reflect"
	"testing"
	"time"
)

// countingDir conta as consultas do nome da conversa.
type countingDir struct {
	Directory
	conversationCalls *int
}

func (d countingDir) ConversationName(ctx context.Context, id string) (string, bool, error) {
	*d.conversationCalls++
	return d.Directory.ConversationName(ctx, id)
}

// buildCounting é o build do rig com o nome da conversa contado.
func (r *rig) buildCounting() *int {
	calls := new(int)
	r.n = NewNotifier(Deps{
		Presence: r.presence, Settings: r.settings, Directory: countingDir{r.dir, calls}, Access: r.access,
		Tokens: r.tokens, Sender: r.sender, Run: func(f func()) { f() }, Now: func() time.Time { return fixedNow },
	})
	return calls
}

func TestDMSemNinguemParaAvisarNaoConsultaOBanco(t *testing.T) {
	r := newRig()
	r.presence.online["u-ana"] = true
	r.presence.status["u-bia"] = "dnd"
	calls := r.buildCounting()
	r.n.OnMessage(dmEvent("oi", "u-ana", "u-bia"))
	expectTokens(t, r)
	if *calls != 0 || r.tokens.calls.single+r.tokens.calls.batch != 0 {
		t.Fatalf("consultas: nome %d, tokens %d/%d; esperava nenhuma", *calls, r.tokens.calls.single, r.tokens.calls.batch)
	}
}

func TestDMBuscaOsTokensDeTodosNumaConsulta(t *testing.T) {
	r := newRig()
	r.presence.online["u-bia"] = true
	calls := r.buildCounting()
	r.n.OnMessage(dmEvent("oi", "u-ana", "u-bia", "u-caio"))
	expectTokens(t, r, "tok-ana", "tok-caio")
	if *calls != 1 || r.tokens.calls.single != 0 || r.tokens.calls.batch != 1 {
		t.Fatalf("consultas: nome %d, tokens %d/%d; esperava 1, 0/1", *calls, r.tokens.calls.single, r.tokens.calls.batch)
	}
	if want := []string{"u-ana", "u-caio"}; !reflect.DeepEqual(r.tokens.calls.batchIDs, want) {
		t.Fatalf("tokens pedidos para %v; esperava %v", r.tokens.calls.batchIDs, want)
	}
}
