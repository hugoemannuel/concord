package apperrors

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

// seedReport: um erro do renderer (ana 1.4.1 e 1.4.2, bia 1.4.2), um do
// celular só da bia, e um antigo fora da janela.
func seedReport(t *testing.T, r *Repository) (render, mobile, old Captured) {
	t.Helper()
	ctx := context.Background()
	render = captured(SourceRenderer, "TypeError", "x", 2)
	mobile = captured(SourceMobile, "Error", "y", 1)
	old = captured(SourceRenderer, "Error", "antigo", 1)
	save := func(user string, cc ClientContext, at time.Time, errs ...Captured) {
		if err := r.SaveAll(ctx, user, cc, errs, at); err != nil {
			t.Fatal(err)
		}
	}
	desk := ClientContext{OS: "Windows", AppVersion: "1.4.1", Target: TargetDesktop}
	save(userAna, desk, t0.Add(-2*time.Hour), render)
	desk.AppVersion = "1.4.2"
	save(userAna, desk, t0.Add(-time.Hour), render)
	save(userBia, ClientContext{OS: "Linux", AppVersion: "1.4.2", Target: TargetWeb}, t0.Add(-30*time.Minute), render)
	save(userBia, ClientContext{OS: "Android 14", AppVersion: "0.3.0", Target: TargetAndroid}, t0.Add(-10*time.Minute), mobile)
	save(userAna, desk, t0.Add(-10*24*time.Hour), old)
	return render, mobile, old
}

func TestReportGroups(t *testing.T) {
	r, _ := newTestRepo(t)
	render, mobile, _ := seedReport(t, r)
	ctx := context.Background()
	from, to := t0.Add(-24*time.Hour), t0

	got, err := r.Groups(ctx, groupQuery{From: from, To: to})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Fingerprint != render.Fingerprint || got[1].Fingerprint != mobile.Fingerprint {
		t.Fatalf("grupos = %+v, quer renderer (2 pessoas) e depois o mobile", got)
	}
	g := got[0]
	if g.Count != 6 || g.Users != 2 || !reflect.DeepEqual(g.Versions, []string{"1.4.1", "1.4.2"}) ||
		!reflect.DeepEqual(g.Systems, []string{"Linux", "Windows"}) || !reflect.DeepEqual(g.Targets, []string{TargetDesktop, TargetWeb}) {
		t.Errorf("grupo = %+v", g)
	}
	bySource, _ := r.Groups(ctx, groupQuery{From: from, To: to, Source: SourceMobile})
	byVersion, _ := r.Groups(ctx, groupQuery{From: from, To: to, Version: "1.4.1"})
	if len(bySource) != 1 || bySource[0].Fingerprint != mobile.Fingerprint {
		t.Errorf("filtro de origem = %+v", bySource)
	}
	if len(byVersion) != 1 || byVersion[0].Count != 2 || byVersion[0].Users != 1 {
		t.Errorf("filtro de versão = %+v, quer só a ocorrência da 1.4.1", byVersion)
	}
}

func TestReportVersionsEIndice(t *testing.T) {
	r, _ := newTestRepo(t)
	render, _, old := seedReport(t, r)
	ctx := context.Background()
	versions, err := r.Versions(ctx, t0.Add(-24*time.Hour), t0, SourceRenderer)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(versions, []string{"1.4.1", "1.4.2"}) {
		t.Errorf("versões do renderer na janela = %v", versions)
	}
	index, err := r.VersionIndex(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := map[string][]string{}
	for _, g := range index {
		found[g.Fingerprint] = g.Versions
	}
	if !reflect.DeepEqual(found[render.Fingerprint], []string{"1.4.1", "1.4.2"}) || !reflect.DeepEqual(found[old.Fingerprint], []string{"1.4.2"}) {
		t.Errorf("índice = %+v", index)
	}
}

func TestReportDetalhe(t *testing.T) {
	r, _ := newTestRepo(t)
	render, _, old := seedReport(t, r)
	ctx := context.Background()
	from, to := t0.Add(-24*time.Hour), t0

	g, stack, err := r.Group(ctx, render.Fingerprint, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if g.Count != 6 || g.Users != 2 || stack != render.Stack {
		t.Errorf("grupo = %+v, pilha %q", g, stack)
	}
	quiet, _, err := r.Group(ctx, old.Fingerprint, from, to)
	if err != nil || quiet.Count != 0 || quiet.Users != 0 || quiet.Versions == nil {
		t.Errorf("grupo sem ocorrência na janela = %+v, %v", quiet, err)
	}
	if _, _, err := r.Group(ctx, "nao-existe", from, to); !errors.Is(err, ErrGroupNotFound) {
		t.Errorf("grupo inexistente: %v", err)
	}
	screens, err := r.Screens(ctx, render.Fingerprint, from, to)
	if err != nil || !reflect.DeepEqual(screens, []ScreenCount{{Screen: "/a", Count: 6}}) {
		t.Errorf("telas = %+v, %v", screens, err)
	}
	recent, err := r.Recent(ctx, render.Fingerprint, from, to, 2)
	if err != nil {
		t.Fatal(err)
	}
	want := Occurrence{At: t0.Add(-30 * time.Minute), Username: "bia", AppVersion: "1.4.2", OS: "Linux", Target: TargetWeb, Screen: "/a", Count: 2}
	if len(recent) != 2 || !recent[0].At.Equal(want.At) {
		t.Fatalf("recentes = %+v", recent)
	}
	recent[0].At = want.At
	if recent[0] != want || recent[1].Username != "ana" {
		t.Errorf("recentes = %+v, quer %+v primeiro", recent, want)
	}
}
