package serverlevel

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/call"
)

type fakeStore struct {
	added      []grant
	failAdd    bool
	addCalls   int
	members    int
	rows       []levelRow
	levels     map[string]int
	detailXP   int64
	detailWeek map[string]int64
}

func (f *fakeStore) AddAll(_ context.Context, grants []grant) error {
	f.addCalls++
	if f.failAdd {
		return errors.New("banco fora")
	}
	f.added = append(f.added, grants...)
	return nil
}
func (f *fakeStore) GrantNewMembers(context.Context) error      { f.members++; return nil }
func (f *fakeStore) Recent(context.Context) ([]levelRow, error) { return f.rows, nil }
func (f *fakeStore) SetLevel(_ context.Context, id string, l int) error {
	if f.levels == nil {
		f.levels = map[string]int{}
	}
	f.levels[id] = l
	return nil
}
func (f *fakeStore) Detail(context.Context, string) (int64, map[string]int64, error) {
	return f.detailXP, f.detailWeek, nil
}

type fakeCalls struct{ snaps []call.CallSnapshot }

func (f *fakeCalls) CallSnapshots() []call.CallSnapshot { return f.snaps }

type fakeReal struct{ asked []string }

func (f *fakeReal) Lookup(_ context.Context, ids []string, _ time.Time) map[string]bool {
	f.asked = ids
	return allReal(ids...)
}

type event struct {
	room, typ string
	payload   map[string]any
}

type fakePub struct{ events []event }

func (f *fakePub) BroadcastToRoom(room string, data []byte) {
	var e struct {
		Type    string         `json:"type"`
		Payload map[string]any `json:"payload"`
	}
	json.Unmarshal(data, &e)
	f.events = append(f.events, event{room, e.Type, e.Payload})
}

func newTestService(st *fakeStore, calls *fakeCalls, pub *fakePub) (*Service, *fakeReal) {
	real := &fakeReal{}
	s := NewService(st, calls, real, pub)
	s.tracker = newTracker(t0)
	return s, real
}

func intp(v int) *int { return &v }

func TestServiceGravaOTempoDeCallACadaMinutoEPerguntaSoQuemEstaEmServidor(t *testing.T) {
	st, pub := &fakeStore{}, &fakePub{}
	calls := &fakeCalls{snaps: []call.CallSnapshot{
		{ServerID: srv("s1"), Participants: []string{"ana", "bia"}, Voice: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"}},
		{Participants: []string{"dm1", "dm2"}},
	}}
	s, real := newTestService(st, calls, pub)
	ctx := context.Background()
	for i := 1; i <= flushEvery; i++ {
		s.tick(ctx, t0.Add(time.Duration(i)*tickInterval))
	}
	if !reflect.DeepEqual(real.asked, []string{"ana", "bia"}) {
		t.Errorf("contas reais perguntadas = %v", real.asked)
	}
	if got := sorted(st.added); !reflect.DeepEqual(got, []grant{{"s1", "ana", SourceVoice, 1}, {"s1", "bia", SourceVoice, 1}}) {
		t.Errorf("gravado = %+v", got)
	}
	if st.addCalls != 1 {
		t.Errorf("escritas = %d, quer 1 (todos numa escrita só)", st.addCalls)
	}
}

func TestServiceFlushQueFalhaDevolveParaOProximo(t *testing.T) {
	st := &fakeStore{failAdd: true}
	s, _ := newTestService(st, &fakeCalls{}, &fakePub{})
	s.tracker.restore(grant{"s1", "ana", SourceVoice, 2})
	s.flush(context.Background())
	st.failAdd = false
	s.flush(context.Background())
	if !reflect.DeepEqual(st.added, []grant{{"s1", "ana", SourceVoice, 2}}) {
		t.Errorf("gravado = %+v, quer o que falhou antes", st.added)
	}
}

func TestServiceContaMembrosNovosACadaCincoMinutos(t *testing.T) {
	st := &fakeStore{}
	s, _ := newTestService(st, &fakeCalls{}, &fakePub{})
	for i := 1; i <= membersEvery; i++ {
		s.tick(context.Background(), t0.Add(time.Duration(i)*tickInterval))
	}
	if st.members != 1 {
		t.Errorf("contagens de membros = %d, quer 1", st.members)
	}
}

func TestServiceSyncAvisaSubidaSoQuandoSobe(t *testing.T) {
	st, pub := &fakeStore{rows: []levelRow{
		{serverID: "sobe", xp: 300, level: intp(1)},
		{serverID: "retro", xp: 8000, level: nil},
		{serverID: "igual", xp: 10, level: intp(1)},
	}}, &fakePub{}
	s, _ := newTestService(st, &fakeCalls{}, pub)
	s.sync(context.Background())

	if !reflect.DeepEqual(st.levels, map[string]int{"sobe": 2, "retro": 5}) {
		t.Errorf("níveis gravados = %v", st.levels)
	}
	var ups []event
	updates := 0
	for _, e := range pub.events {
		switch e.typ {
		case "server:level:up":
			ups = append(ups, e)
		case "server:level:update":
			updates++
		}
	}
	if len(ups) != 1 || ups[0].room != "server:sobe" || ups[0].payload["level"] != float64(2) || ups[0].payload["previous_level"] != float64(1) {
		t.Errorf("subidas = %+v, quer só a do servidor que subiu (sem aviso do retroativo)", ups)
	}
	if updates != 3 {
		t.Errorf("updates = %d, quer 3 na primeira vez", updates)
	}

	// Sem XP novo, sem update de novo.
	pub.events = nil
	st.rows = []levelRow{{serverID: "igual", xp: 10, level: intp(1)}}
	s.sync(context.Background())
	if len(pub.events) != 0 {
		t.Errorf("eventos = %+v, quer nenhum sem mudança", pub.events)
	}
}

func TestLevelChange(t *testing.T) {
	tests := []struct {
		name   string
		stored *int
		level  int
		want   change
	}{
		{"retroativo grava sem aviso", nil, 4, change{save: true}},
		{"igual não faz nada", intp(3), 3, change{}},
		{"subiu grava e avisa", intp(3), 4, change{save: true, announce: true}},
		{"desceu grava sem aviso", intp(3), 2, change{save: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := levelChange(tt.stored, tt.level); got != tt.want {
				t.Errorf("levelChange = %+v, quer %+v", got, tt.want)
			}
		})
	}
}

func TestServiceDetailListaTodasAsFontesNaOrdem(t *testing.T) {
	st := &fakeStore{detailXP: 1300, detailWeek: map[string]int64{SourceVoice: 90, SourceMessages: 40}}
	s, _ := newTestService(st, &fakeCalls{}, &fakePub{})
	d, err := s.Detail(context.Background(), "s1")
	if err != nil {
		t.Fatal(err)
	}
	if d.Level != 3 || len(d.Week) != len(Sources) {
		t.Fatalf("detail = %+v", d)
	}
	if d.Week[1] != (SourceXP{SourceMessages, 40}) || d.Week[4] != (SourceXP{SourceVoice, 90}) || d.Week[0].XP != 0 {
		t.Errorf("semana = %+v", d.Week)
	}
}

func TestServiceRunGravaNoDesligamento(t *testing.T) {
	st := &fakeStore{}
	s, _ := newTestService(st, &fakeCalls{}, &fakePub{})
	s.tracker.restore(grant{"s1", "ana", SourceVoice, 1})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.Run(ctx)
	if len(st.added) != 1 {
		t.Errorf("gravado = %+v, quer o minuto pendente", st.added)
	}
}
