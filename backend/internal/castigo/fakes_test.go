package castigo

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/permission"
)

// memStore: o banco em memória.
type memStore struct {
	mu   sync.Mutex
	rows map[string]Castigo
}

func newMemStore() *memStore { return &memStore{rows: map[string]Castigo{}} }

func (m *memStore) Save(_ context.Context, c Castigo) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows[c.ServerID+"|"+c.UserID] = c
	return nil
}

func (m *memStore) Delete(_ context.Context, serverID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rows, serverID+"|"+userID)
	return nil
}

func (m *memStore) Active(_ context.Context, now time.Time) ([]Castigo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Castigo
	for _, c := range m.rows {
		if c.active(now) {
			out = append(out, c)
		}
	}
	return out, nil
}

func (m *memStore) DeleteExpired(_ context.Context, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, c := range m.rows {
		if !c.active(now) {
			delete(m.rows, k)
		}
	}
	return nil
}

type fakePerms struct{ snap *permission.Snapshot }

func (f fakePerms) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return f.snap, nil
}

// fakeCalls: quem está em qual call (todas do srv-1, canal "geral").
type fakeCalls struct {
	in       map[string]string // userID -> callID
	enforced []string
}

func (f *fakeCalls) VoiceLocationOf(userID string) (call.VoiceLocation, bool) {
	callID, ok := f.in[userID]
	return call.VoiceLocation{CallID: callID, ChannelID: "geral", ServerID: "srv-1"}, ok
}

func (f *fakeCalls) ParticipantIDs(callID string) []string {
	var out []string
	for u, c := range f.in {
		if c == callID {
			out = append(out, u)
		}
	}
	return out
}

func (f *fakeCalls) EnforceCastigo(_ context.Context, serverID, userID string) {
	f.enforced = append(f.enforced, serverID+"|"+userID)
}

type sent struct {
	to, typ string
	payload json.RawMessage
}

type fakePub struct{ events []sent }

func (p *fakePub) record(to string, event []byte) {
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	_ = json.Unmarshal(event, &env)
	p.events = append(p.events, sent{to, env.Type, env.Payload})
}

func (p *fakePub) BroadcastToRoom(room string, event []byte)   { p.record(room, event) }
func (p *fakePub) BroadcastToCall(callID string, event []byte) { p.record("call:"+callID, event) }

type fakeAudit struct{ events []audit.Event }

func (f *fakeAudit) Record(_ context.Context, e audit.Event) { f.events = append(f.events, e) }

// world: dono; mod (cargo 2, moderação de voz); chefe (cargo 3, só silenciar);
// ana, bia, caio e duda comuns; visita não é membro.
type world struct {
	svc   *Service
	store *memStore
	calls *fakeCalls
	pub   *fakePub
	audit *fakeAudit
	now   time.Time
}

const voiceMod = permission.MuteMembers | permission.DeafenMembers | permission.DisconnectMembers

func newWorld(t *testing.T) *world {
	t.Helper()
	snap := permission.NewSnapshot("srv-1", "dono", permission.DefaultEveryone).
		WithRole("mod", 2, voiceMod).
		WithRole("chefe", 3, permission.MuteMembers).
		WithMember("dono").
		WithMember("mod", "mod").
		WithMember("mod2", "mod").
		WithMember("chefe", "chefe").
		WithMember("ana").WithMember("bia").WithMember("caio").WithMember("duda")
	w := &world{store: newMemStore(), calls: &fakeCalls{in: map[string]string{}}, pub: &fakePub{}, audit: &fakeAudit{}}
	w.now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	w.svc = NewService(w.store, fakePerms{snap}, w.calls, w.pub)
	w.svc.SetAudit(w.audit)
	w.svc.now = func() time.Time { return w.now }
	return w
}

// inCall põe os usuários na call c1.
func (w *world) inCall(users ...string) {
	for _, u := range users {
		w.calls.in[u] = "c1"
	}
}

func (w *world) last(typ string) sent {
	for i := len(w.pub.events) - 1; i >= 0; i-- {
		if w.pub.events[i].typ == typ {
			return w.pub.events[i]
		}
	}
	return sent{}
}

func speak5min(userID string) Request {
	return Request{UserID: userID, Effects: Effects{Speak: true}, Duration: 300}
}
