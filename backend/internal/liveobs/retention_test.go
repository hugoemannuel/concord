package liveobs

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakePruner struct {
	before time.Time
	err    error
}

func (f *fakePruner) Prune(_ context.Context, before time.Time) error {
	f.before = before
	return f.err
}

func TestRetentionApagaOQuePassouDe14Dias(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	a, b := &fakePruner{}, &fakePruner{err: errors.New("banco fora")}
	c := &fakePruner{}
	r := NewRetention(a, b, c)
	r.now = func() time.Time { return now }
	if err := r.Prune(context.Background()); err == nil {
		t.Fatal("quer o erro do segundo")
	}
	want := now.Add(-14 * 24 * time.Hour)
	for i, p := range []*fakePruner{a, b, c} {
		if !p.before.Equal(want) {
			t.Errorf("pruner %d: antes de %v, quer %v (um erro não para os outros)", i, p.before, want)
		}
	}
}

type fakeCloser struct {
	fakePruner
	closedBefore time.Time
}

func (f *fakeCloser) CloseStale(_ context.Context, before time.Time) error {
	f.closedBefore = before
	return nil
}

func TestRetentionFechaAsSessoesSemNoticiaHa10Minutos(t *testing.T) {
	now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	c := &fakeCloser{}
	r := NewRetention(&fakePruner{}, c)
	r.now = func() time.Time { return now }
	if err := r.Prune(context.Background()); err != nil {
		t.Fatal(err)
	}
	if want := now.Add(-10 * time.Minute); !c.closedBefore.Equal(want) {
		t.Errorf("fechou antes de %v, quer %v", c.closedBefore, want)
	}
	if want := now.Add(-14 * 24 * time.Hour); !c.before.Equal(want) {
		t.Errorf("apagou antes de %v, quer %v", c.before, want)
	}
}
