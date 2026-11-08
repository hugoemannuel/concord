package linkpreview

import (
	"bytes"
	"context"
	"errors"
	"log"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

type fakeJanitorStore struct {
	deletedBefore time.Time
	used          map[string]bool
}

func (s *fakeJanitorStore) DeleteExpired(_ context.Context, before time.Time) (int64, error) {
	s.deletedBefore = before
	return 2, nil
}

func (s *fakeJanitorStore) ImageIDs(context.Context) (map[string]bool, error) { return s.used, nil }

type fakeFiles struct {
	files   []media.FileInfo
	removed []string
}

func (f *fakeFiles) List() ([]media.FileInfo, error) { return f.files, nil }
func (f *fakeFiles) Remove(name string) error        { f.removed = append(f.removed, name); return nil }

func TestJanitorApagaVencidosEArquivosSemLinha(t *testing.T) {
	const (
		used   = "11111111-1111-1111-1111-111111111111"
		orphan = "22222222-2222-2222-2222-222222222222"
		recent = "33333333-3333-3333-3333-333333333333"
		tmpOld = "44444444-4444-4444-4444-444444444444"
		tmpNew = "55555555-5555-5555-5555-555555555555"
	)
	old, fresh := now.Add(-2*time.Hour), now.Add(-10*time.Minute)
	store := &fakeJanitorStore{used: map[string]bool{used: true}}
	files := &fakeFiles{files: []media.FileInfo{
		{Name: used, ID: used, ModTime: old},
		{Name: orphan, ID: orphan, ModTime: old},
		{Name: recent, ID: recent, ModTime: fresh},
		{Name: ".tmp-" + tmpOld, ID: tmpOld, Temp: true, ModTime: old},
		{Name: ".tmp-" + tmpNew, ID: tmpNew, Temp: true, ModTime: fresh},
	}}
	j := NewJanitor(store, files)
	j.now = func() time.Time { return now }

	rows, removed, err := j.Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !store.deletedBefore.Equal(now.Add(-cacheTTL)) || rows != 2 {
		t.Errorf("DeleteExpired(%v) = %d, want antes de %v", store.deletedBefore, rows, now.Add(-cacheTTL))
	}
	sort.Strings(files.removed)
	want := []string{".tmp-" + tmpOld, orphan}
	if removed != 2 || len(files.removed) != 2 || files.removed[0] != want[0] || files.removed[1] != want[1] {
		t.Errorf("apagou %v (%d), want %v", files.removed, removed, want)
	}
}

func TestJanitorRunFazUmaFaxinaNaHoraEParaComOContexto(t *testing.T) {
	store := &fakeJanitorStore{used: map[string]bool{}}
	j := NewJanitor(store, &fakeFiles{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	j.Run(ctx)
	if store.deletedBefore.IsZero() {
		t.Error("Run não fez a faxina antes de parar")
	}
}

func TestLogSweepSoRegistraQuandoAlgoAconteceu(t *testing.T) {
	var out bytes.Buffer
	log.SetOutput(&out)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })

	logSweep(0, 0, nil)
	if out.Len() != 0 {
		t.Errorf("faxina vazia registrou %q", out.String())
	}
	logSweep(2, 1, nil)
	if !strings.Contains(out.String(), "2 prévia(s) vencida(s), 1 imagem(ns)") {
		t.Errorf("faxina com resultado: %q", out.String())
	}
	logSweep(0, 0, errors.New("banco caiu"))
	if !strings.Contains(out.String(), "banco caiu") {
		t.Errorf("erro não registrado: %q", out.String())
	}
}
