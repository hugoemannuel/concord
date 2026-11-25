package alert

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type engineFixture struct {
	engine *Engine
	store  *fakeStore
	sender *fakeSender
	src    *scripted
	clock  time.Time
}

func newEngineFixture(t *testing.T, hold Hold, muted ...string) *engineFixture {
	t.Helper()
	f := &engineFixture{store: &fakeStore{}, sender: &fakeSender{}, src: &scripted{}, clock: at(14, 0)}
	f.engine = NewEngine([]Rule{f.src.rule("coisa", hold)}, f.store, f.sender, "", muted)
	f.engine.now = func() time.Time { return f.clock }
	if err := f.engine.Load(context.Background()); err != nil {
		t.Fatal(err)
	}
	return f
}

// tick: uma avaliação com a leitura dada, um minuto depois da anterior.
func (f *engineFixture) tick(t *testing.T, level Level, text string) {
	t.Helper()
	f.src.reading = Reading{Level: level, Text: text}
	if err := f.engine.Evaluate(context.Background()); err != nil && f.src.err == nil {
		t.Fatal(err)
	}
	f.clock = f.clock.Add(time.Minute)
}

func TestEngineDisparaUmaVezEDepoisNormaliza(t *testing.T) {
	f := newEngineFixture(t, Hold{Warning: 2 * time.Minute, Clear: time.Minute})
	f.tick(t, LevelWarning, "x em 90")
	f.tick(t, LevelWarning, "x em 91")
	if len(f.sender.msgs) != 0 {
		t.Fatalf("disparou antes do tempo: %+v", f.sender.msgs)
	}
	f.tick(t, LevelWarning, "x em 92")
	f.tick(t, LevelWarning, "x em 93")
	f.tick(t, LevelOK, "")
	f.tick(t, LevelOK, "")
	want := []string{"Aviso: x em 92, desde 14:00.", "Normalizou: Coisa. Durou 5 min (de 14:00 a 14:05)."}
	if len(f.sender.msgs) != 2 || f.sender.msgs[0].text != want[0] || f.sender.msgs[1].text != want[1] {
		t.Fatalf("mensagens = %+v", f.sender.msgs)
	}
	if got := f.store.rows[0]; got.EndedAt == nil || got.Severity != "aviso" || got.Text != "x em 93" {
		t.Errorf("incidente = %+v", got)
	}
}

func TestEngineAgravaComAllEDepoisNaoRepete(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	f.tick(t, LevelWarning, "x em 90")
	f.tick(t, LevelCritical, "x em 99")
	f.tick(t, LevelCritical, "x em 99")
	f.tick(t, LevelWarning, "x em 90")
	if len(f.sender.msgs) != 2 {
		t.Fatalf("mensagens = %+v", f.sender.msgs)
	}
	if m := f.sender.msgs[1]; m.level != LevelCritical || !strings.HasPrefix(m.text, "@all Crítico (piorou): x em 99") {
		t.Errorf("agravou = %+v", m)
	}
	if f.store.rows[0].Severity != "critico" {
		t.Errorf("gravidade = %q", f.store.rows[0].Severity)
	}
}

func TestEngineReinicioNaoRepeteODisparo(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	f.tick(t, LevelWarning, "x em 90")
	// Processo novo: mesmo banco, memória vazia.
	again := NewEngine([]Rule{f.src.rule("coisa", Hold{})}, f.store, f.sender, "", nil)
	again.now = func() time.Time { return f.clock }
	if err := again.Load(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.engine = again
	f.tick(t, LevelWarning, "x em 90")
	f.tick(t, LevelOK, "")
	if len(f.sender.msgs) != 2 || !strings.HasPrefix(f.sender.msgs[1].text, "Normalizou") {
		t.Fatalf("mensagens = %+v", f.sender.msgs)
	}
}

func TestEngineLembraDepoisDeHoras(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	f.tick(t, LevelWarning, "x em 90")
	f.clock = f.clock.Add(remindEvery)
	f.tick(t, LevelWarning, "x em 91")
	if len(f.sender.msgs) != 2 || !strings.HasPrefix(f.sender.msgs[1].text, "Continua: x em 91, há 6 h") {
		t.Fatalf("mensagens = %+v", f.sender.msgs)
	}
}

func TestEngineSemDadoNaoMudaNada(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	f.tick(t, LevelWarning, "x em 90")
	f.src.err = errors.New("banco fora")
	f.tick(t, LevelOK, "")
	f.src.err = nil
	f.tick(t, LevelUnknown, "")
	if len(f.sender.msgs) != 1 || f.store.rows[0].EndedAt != nil {
		t.Fatalf("mudou sem dado: %+v", f.sender.msgs)
	}
}

func TestEngineRegraSilenciadaGravaMasNaoPosta(t *testing.T) {
	f := newEngineFixture(t, Hold{}, "coisa")
	f.tick(t, LevelCritical, "x em 99")
	if len(f.sender.msgs) != 0 || len(f.store.rows) != 1 {
		t.Fatalf("mensagens %+v, incidentes %+v", f.sender.msgs, f.store.rows)
	}
}

func TestEngineFechaIncidenteDeRegraQueNaoExisteMais(t *testing.T) {
	store := &fakeStore{}
	_ = store.InsertIncident(context.Background(), &Incident{RuleID: "velha", Severity: "aviso", StartedAt: at(10, 0)})
	e := NewEngine(nil, store, &fakeSender{}, "", nil)
	e.now = func() time.Time { return at(14, 0) }
	if err := e.Load(context.Background()); err != nil {
		t.Fatal(err)
	}
	if store.rows[0].EndedAt == nil {
		t.Error("incidente da regra removida ficou aberto")
	}
}

func TestEngineNotifyGravaFechadoEPosta(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	ev := Event{RuleID: "backend_down", Channel: ChannelInfra, Level: LevelWarning, Text: "Aviso: caiu.", StartedAt: at(13, 0), EndedAt: at(13, 16)}
	if err := f.engine.Notify(context.Background(), ev); err != nil {
		t.Fatal(err)
	}
	got := f.store.rows[0]
	if got.EndedAt == nil || !got.EndedAt.Equal(at(13, 16)) || got.RuleID != "backend_down" {
		t.Errorf("incidente = %+v", got)
	}
	if len(f.sender.msgs) != 1 || f.sender.msgs[0].text != "Aviso: caiu." {
		t.Errorf("mensagens = %+v", f.sender.msgs)
	}
}

func TestEngineIsOpen(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	if f.engine.IsOpen("coisa") {
		t.Fatal("aberto antes de disparar")
	}
	f.tick(t, LevelWarning, "x")
	if !f.engine.IsOpen("coisa") {
		t.Fatal("fechado depois de disparar")
	}
}
