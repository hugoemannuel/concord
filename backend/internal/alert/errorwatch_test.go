package alert

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

type fakeNewErrors struct {
	groups []apperrors.GroupHead
	since  []time.Time
	err    error
}

func (f *fakeNewErrors) GroupsFirstSeenSince(_ context.Context, since time.Time) ([]apperrors.GroupHead, error) {
	f.since = append(f.since, since)
	var out []apperrors.GroupHead
	for _, g := range f.groups {
		if !g.FirstSeen.Before(since) {
			out = append(out, g)
		}
	}
	return out, f.err
}

func group(i int, seen time.Time) apperrors.GroupHead {
	return apperrors.GroupHead{Fingerprint: fmt.Sprint(i), Source: apperrors.SourceRenderer, Kind: "TypeError",
		Message: fmt.Sprintf("x%d is undefined", i), FirstSeen: seen, FirstVersion: "0.6.102"}
}

func newErrorWatch(src *fakeNewErrors, last *Incident, events *[]Event, now *time.Time) *ErrorWatch {
	w := NewErrorWatch(src, &fakeLastIncident{last: last}, func(_ context.Context, ev Event) error {
		*events = append(*events, ev)
		return nil
	}, "https://app.exemplo")
	w.now = func() time.Time { return *now }
	return w
}

func TestErrorWatchAvisaCadaGrupoNovoUmaVez(t *testing.T) {
	now := at(14, 0)
	src := &fakeNewErrors{}
	var events []Event
	w := newErrorWatch(src, nil, &events, &now)
	src.groups = []apperrors.GroupHead{group(1, now.Add(-time.Hour))} // de antes de ligar: não avisa
	_ = w.Tick(context.Background())
	if len(events) != 0 {
		t.Fatalf("avisou o que já existia: %+v", events)
	}
	now = now.Add(time.Minute)
	src.groups = append(src.groups, group(2, now.Add(-30*time.Second)))
	_ = w.Tick(context.Background())
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(events) != 1 {
		t.Fatalf("eventos = %+v", events)
	}
	want := "Erro novo no app, versão 0.6.102: TypeError: x2 is undefined. Aba Erros: https://app.exemplo/observabilidade/erros"
	if ev := events[0]; ev.Text != want || ev.Channel != ChannelErrors || ev.Level != LevelWarning || ev.RuleID != "error_new" {
		t.Errorf("evento = %+v", ev)
	}
}

func TestErrorWatchTetoPorHora(t *testing.T) {
	now := at(14, 0)
	src := &fakeNewErrors{}
	var events []Event
	w := newErrorWatch(src, nil, &events, &now)
	_ = w.Tick(context.Background())
	for i := range 12 {
		src.groups = append(src.groups, group(i, now.Add(time.Duration(i+1)*time.Second)))
	}
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(events) != 6 {
		t.Fatalf("eventos = %d, quer 5 + 1 resumo", len(events))
	}
	many := events[5]
	if many.Quiet || many.Text != "Mais 7 erros novos (teto de 5 avisos por hora), a maioria no app, versão 0.6.102. Aba Erros: https://app.exemplo/observabilidade/erros" {
		t.Errorf("resumo = %+v", many)
	}
	if !many.StartedAt.Equal(src.groups[11].FirstSeen) {
		t.Errorf("o resumo grava o último first_seen (o cursor): %v", many.StartedAt)
	}
	src.groups = append(src.groups, group(20, now.Add(10*time.Second)))
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(events) != 7 || !events[6].Quiet {
		t.Fatalf("o segundo resumo na mesma hora tem de ser só histórico: %+v", events[6:])
	}
	src.groups = append(src.groups, group(21, now.Add(10*time.Second)))
	now = now.Add(time.Hour)
	_ = w.Tick(context.Background())
	if len(events) != 8 || events[7].Quiet || !strings.HasPrefix(events[7].Text, "Erro novo") {
		t.Fatalf("passada a hora, volta a avisar um a um: %+v", events[7:])
	}
}

func TestErrorWatchRetomaDoHistorico(t *testing.T) {
	now := at(14, 0)
	lastSeen := now.Add(-10 * time.Minute)
	src := &fakeNewErrors{}
	var events []Event
	w := newErrorWatch(src, &Incident{StartedAt: lastSeen}, &events, &now)
	_ = w.Tick(context.Background())
	if got := src.since[0]; !got.Equal(lastSeen) {
		t.Errorf("cursor = %v, quer %v", got, lastSeen)
	}
	w2 := newErrorWatch(src, &Incident{StartedAt: now.Add(-48 * time.Hour)}, &events, &now)
	_ = w2.Tick(context.Background())
	if got := src.since[1]; !got.Equal(now.Add(-time.Hour)) {
		t.Errorf("cursor velho = %v, quer no máximo 1 h atrás", got)
	}
}

func TestErrorWatchFalhas(t *testing.T) {
	now := at(14, 0)
	w := NewErrorWatch(&fakeNewErrors{}, &fakeLastIncident{err: errors.New("banco")}, nil, "")
	w.now = func() time.Time { return now }
	if err := w.Tick(context.Background()); err == nil {
		t.Fatal("engoliu o erro do histórico")
	}
	src := &fakeNewErrors{}
	failing := NewErrorWatch(src, &fakeLastIncident{}, func(context.Context, Event) error { return errors.New("canal") }, "")
	failing.now = func() time.Time { return now }
	_ = failing.Tick(context.Background())
	src.groups = []apperrors.GroupHead{group(1, now.Add(time.Second))}
	now = now.Add(time.Minute)
	if err := failing.Tick(context.Background()); err == nil || !failing.cursor.Equal(at(14, 0)) {
		t.Fatalf("post que falha não pode avançar o cursor: %v, %v", err, failing.cursor)
	}
}

func TestErrorTexts(t *testing.T) {
	g := apperrors.GroupHead{Source: apperrors.SourceMobile, Kind: "Error", Message: "Error: rede caiu"}
	if got := newErrorText(g, ""); got != "Erro novo no Android: Error: rede caiu. Aba Erros: /observabilidade/erros" {
		t.Errorf("sem versão e sem link = %q", got)
	}
	long := strings.Repeat("a", 300)
	if got := short(long); len([]rune(got)) != errorTextMax || !strings.HasSuffix(got, "…") {
		t.Errorf("short = %d letras", len([]rune(got)))
	}
	for source, want := range map[string]string{"main": "Electron (main)", "backend": "backend", "outro": "outro"} {
		if got := sourceLabel(source); got != want {
			t.Errorf("sourceLabel(%s) = %q", source, got)
		}
	}
}

func TestErrorSpikeRule(t *testing.T) {
	now := at(14, 0)
	impact := func(users int) []apperrors.GroupImpact {
		return []apperrors.GroupImpact{{Source: apperrors.SourceRenderer, Kind: "TypeError", Message: "x is undefined", Users: users, Count: users * 3}}
	}
	if got := check(t, errorSpikeRule(&fakeSources{impact: impact(4)}), now); got.Level != LevelOK {
		t.Errorf("4 pessoas = %+v", got)
	}
	if got := check(t, errorSpikeRule(&fakeSources{}), now); got.Level != LevelOK {
		t.Errorf("sem erro = %+v", got)
	}
	got := check(t, errorSpikeRule(&fakeSources{impact: impact(6)}), now)
	want := `o erro "TypeError: x is undefined" (app) atingiu 6 pessoas em 15 min (limite 5): algo quebrou para muita gente; veja a aba Erros e, se veio com a última versão, reverta`
	if got.Level != LevelWarning || got.Text != want {
		t.Errorf("6 pessoas = %+v", got)
	}
	if got := check(t, errorSpikeRule(&fakeSources{impact: impact(9)}), now); got.Level != LevelCritical || !strings.Contains(got.Text, "atingiu 9 pessoas em 15 min (limite 8)") {
		t.Errorf("9 pessoas = %+v", got)
	}
}

func TestDecoderFailingRule(t *testing.T) {
	now := at(14, 0)
	src := &fakeSources{people: map[string]int{"decoder_software|": 3}}
	if got := check(t, decoderFailingRule(src), now); got.Level != LevelOK {
		t.Errorf("3 pessoas = %+v", got)
	}
	src.people["decoder_software|"] = 4
	if got := check(t, decoderFailingRule(src), now); got.Level != LevelWarning ||
		!strings.HasPrefix(got.Text, "4 pessoas assistindo live com o vídeo caindo para o processador em 10 min (limite 4)") {
		t.Errorf("4 pessoas = %+v", got)
	}
}

// Regressão (revisão): um lote grava o mesmo first_seen em vários grupos; o
// post que falha no meio não pode fazer os outros sumirem.
func TestErrorWatchMesmoInstanteNaoPerdeGrupos(t *testing.T) {
	now := at(14, 0)
	src := &fakeNewErrors{}
	var posted []string
	fail := false
	w := NewErrorWatch(src, &fakeLastIncident{}, func(_ context.Context, ev Event) error {
		if fail && strings.Contains(ev.Text, "x2") {
			return errors.New("canal")
		}
		posted = append(posted, ev.Text)
		return nil
	}, "")
	w.now = func() time.Time { return now }
	_ = w.Tick(context.Background())
	seen := now.Add(5 * time.Second)
	src.groups = []apperrors.GroupHead{group(1, seen), group(2, seen), group(3, seen)}
	now = now.Add(time.Minute)
	fail = true
	if err := w.Tick(context.Background()); err == nil {
		t.Fatal("engoliu o erro")
	}
	fail = false
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(posted) != 3 || !strings.Contains(posted[1], "x2") || !strings.Contains(posted[2], "x3") {
		t.Fatalf("posts = %q", posted)
	}
}

// Regressão (revisão): grupo de menos de 30 s espera (o lote mais velho pode
// confirmar depois).
func TestErrorWatchEsperaOGrupoAssentar(t *testing.T) {
	now := at(14, 0)
	src := &fakeNewErrors{}
	var events []Event
	w := newErrorWatch(src, nil, &events, &now)
	_ = w.Tick(context.Background())
	src.groups = []apperrors.GroupHead{group(1, now.Add(50*time.Second))}
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(events) != 0 {
		t.Fatal("avisou antes de assentar")
	}
	src.groups = append([]apperrors.GroupHead{group(0, now.Add(-50*time.Second))}, src.groups...) // confirmou atrasado, mais velho
	now = now.Add(time.Minute)
	_ = w.Tick(context.Background())
	if len(events) != 2 {
		t.Fatalf("eventos = %d, quer os 2", len(events))
	}
}
