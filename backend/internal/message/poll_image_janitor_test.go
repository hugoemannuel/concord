package message

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/google/uuid"
)

type fakePollImageRefs struct {
	urls []string
	err  error
}

func (f fakePollImageRefs) PollImageURLs(context.Context) ([]string, error) { return f.urls, f.err }

type fakePollImageFiles struct {
	files   []media.FileInfo
	removed []string
}

func (f *fakePollImageFiles) List() ([]media.FileInfo, error) { return f.files, nil }

func (f *fakePollImageFiles) Remove(name string) error {
	f.removed = append(f.removed, name)
	return nil
}

func TestPollImageJanitorApagaSoOsOrfaosVelhos(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	usada, orfa, nova, tmp := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	old := now.Add(-2 * time.Hour)
	files := &fakePollImageFiles{files: []media.FileInfo{
		{Name: usada, ID: usada, ModTime: old},
		{Name: orfa, ID: orfa, ModTime: old},
		{Name: nova, ID: nova, ModTime: now.Add(-time.Minute)},
		{Name: ".tmp-" + tmp, ID: tmp, Temp: true, ModTime: old},
	}}
	j := NewPollImageJanitor(fakePollImageRefs{urls: []string{PollImagePath + usada}}, files)
	j.now = func() time.Time { return now }

	removed, err := j.Sweep(context.Background())
	if err != nil || removed != 2 {
		t.Fatalf("removed = %d, err = %v", removed, err)
	}
	if len(files.removed) != 2 || files.removed[0] != orfa || files.removed[1] != ".tmp-"+tmp {
		t.Fatalf("apagou %v", files.removed)
	}
}

// Sem conseguir ler o banco, não apaga nada (apagaria imagens em uso).
func TestPollImageJanitorBancoForaNaoApaga(t *testing.T) {
	id := uuid.NewString()
	files := &fakePollImageFiles{files: []media.FileInfo{{Name: id, ID: id}}}
	j := NewPollImageJanitor(fakePollImageRefs{err: errors.New("banco fora")}, files)
	if _, err := j.Sweep(context.Background()); err == nil || len(files.removed) != 0 {
		t.Fatalf("err = %v, apagou %v", err, files.removed)
	}
}

// Run faz a faxina na hora e sai quando o contexto acaba.
func TestPollImageJanitorRunFazAFaxinaESaiComOContexto(t *testing.T) {
	id := uuid.NewString()
	files := &fakePollImageFiles{files: []media.FileInfo{{Name: id, ID: id}}}
	j := NewPollImageJanitor(fakePollImageRefs{}, files)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() {
		j.Run(ctx)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run não saiu com o contexto cancelado")
	}
	if len(files.removed) != 1 {
		t.Fatalf("faxina inicial apagou %v", files.removed)
	}
	logPollImageSweep(0, errors.New("banco fora"))
	logPollImageSweep(1, nil)
}
