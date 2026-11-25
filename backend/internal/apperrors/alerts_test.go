package apperrors

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestGroupsFirstSeenSince(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{AppVersion: "1.4.2", Target: TargetDesktop}
	old := captured(SourceRenderer, "Error", "velho", 1)
	fresh := captured(SourceMain, "TypeError", "novo", 1)
	if err := r.SaveAll(ctx, userAna, cc, []Captured{old}, t0.Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := r.SaveAll(ctx, userAna, cc, []Captured{old, fresh}, t0); err != nil {
		t.Fatal(err)
	}
	got, err := r.GroupsFirstSeenSince(ctx, t0.Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	want := []GroupHead{{Fingerprint: fresh.Fingerprint, Source: SourceMain, Kind: "TypeError", Message: "novo", FirstSeen: t0, FirstVersion: "1.4.2"}}
	if len(got) != 1 || !got[0].FirstSeen.Equal(t0) {
		t.Fatalf("grupos novos = %+v", got)
	}
	got[0].FirstSeen = t0
	if !reflect.DeepEqual(got, want) {
		t.Errorf("grupos novos = %+v, quer %+v", got, want)
	}
}

func TestAffectedByGroup(t *testing.T) {
	r, _ := newTestRepo(t)
	ctx := context.Background()
	cc := ClientContext{AppVersion: "1", Target: TargetWeb}
	e := captured(SourceRenderer, "Error", "x", 2)
	other := captured(SourceRenderer, "Error", "fora da janela", 1)
	for _, u := range []string{userAna, userBia} {
		if err := r.SaveAll(ctx, u, cc, []Captured{e}, t0.Add(10*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.SaveAll(ctx, "", cc, []Captured{e}, t0.Add(10*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := r.SaveAll(ctx, userAna, cc, []Captured{other}, t0.Add(-3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	got, err := r.AffectedByGroup(ctx, t0, t0.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	want := []GroupImpact{{Fingerprint: e.Fingerprint, Source: SourceRenderer, Kind: "Error", Message: "x", Users: 2, Count: 6}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("impacto = %+v, quer %+v", got, want)
	}
}
