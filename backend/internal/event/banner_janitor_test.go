package event

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

type fakeRefs map[string]bool

func (f fakeRefs) LiveBannerIDs(context.Context) (map[string]bool, error) { return f, nil }

func TestBannerJanitorRemovesOnlyOldUnusedFiles(t *testing.T) {
	dir := t.TempDir()
	store, err := media.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	const (
		inUse     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" // evento vivo usa
		abandoned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" // enviado há 2 dias e nunca usado
		fresh     = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" // enviado agora, o formulário ainda está aberto
		oldInUse  = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" // velho, mas em uso
	)
	for _, id := range []string{inUse, abandoned, fresh, oldInUse} {
		if _, _, err := store.Save(id, bytes.NewReader([]byte("x")), 1<<20); err != nil {
			t.Fatal(err)
		}
	}
	twoDaysAgo := now.Add(-48 * time.Hour)
	for _, id := range []string{abandoned, oldInUse} {
		if err := os.Chtimes(filepath.Join(dir, id), twoDaysAgo, twoDaysAgo); err != nil {
			t.Fatal(err)
		}
	}

	janitor := NewBannerJanitor(store, fakeRefs{inUse: true, oldInUse: true})
	janitor.now = func() time.Time { return now }
	removed, err := janitor.Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 1 || removed[0] != abandoned {
		t.Fatalf("apagados = %v, esperava só o abandonado", removed)
	}
	left, _ := store.List()
	var names []string
	for _, f := range left {
		names = append(names, f.ID)
	}
	sort.Strings(names)
	want := []string{inUse, fresh, oldInUse}
	sort.Strings(want)
	if len(names) != 3 || names[0] != want[0] || names[1] != want[1] || names[2] != want[2] {
		t.Fatalf("sobraram %v, esperava %v", names, want)
	}
}

func TestBannerJanitorRunSweepsRightAwayAndStops(t *testing.T) {
	dir := t.TempDir()
	store, _ := media.NewStore(dir)
	const abandoned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	_, _, _ = store.Save(abandoned, bytes.NewReader([]byte("x")), 1<<20)
	old := time.Now().Add(-48 * time.Hour)
	_ = os.Chtimes(filepath.Join(dir, abandoned), old, old)

	janitor := NewBannerJanitor(store, fakeRefs{})
	janitor.every = 5 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		janitor.Run(ctx)
		close(done)
	}()
	deadline := time.After(2 * time.Second)
	for {
		if files, _ := store.List(); len(files) == 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("a faxina não rodou")
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run não terminou com o contexto cancelado")
	}
}
