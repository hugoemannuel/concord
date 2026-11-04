package serverprofile

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

type fakeFiles struct {
	files   []media.FileInfo
	removed []string
	err     error
}

func (f *fakeFiles) List() ([]media.FileInfo, error) { return f.files, f.err }
func (f *fakeFiles) Remove(name string) error {
	f.removed = append(f.removed, name)
	return errors.New("só registra")
}

type fakeRefs struct {
	urls []string
	err  error
}

func (f fakeRefs) ImagesInUse(context.Context) ([]string, error) { return f.urls, f.err }

func TestImageJanitorApagaSoOQueSobrou(t *testing.T) {
	now := time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)
	old := now.Add(-2 * imageGrace)
	files := &fakeFiles{files: []media.FileInfo{
		{ID: "usada", ModTime: old},
		{ID: "sobrou", ModTime: old},
		{ID: "recente", ModTime: now},
		{ID: "temporaria", ModTime: old, Temp: true},
	}}
	j := NewImageJanitor(files, fakeRefs{urls: []string{ImagePath + "usada"}})
	j.now = func() time.Time { return now }
	if err := j.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(files.removed, []string{"sobrou"}) {
		t.Errorf("apagou %v, quer só sobrou", files.removed)
	}
}

func TestImageJanitorErros(t *testing.T) {
	boom := errors.New("fora")
	if err := NewImageJanitor(&fakeFiles{}, fakeRefs{err: boom}).Sweep(context.Background()); !errors.Is(err, boom) {
		t.Errorf("refs: %v", err)
	}
	if err := NewImageJanitor(&fakeFiles{err: boom}, fakeRefs{}).Sweep(context.Background()); !errors.Is(err, boom) {
		t.Errorf("arquivos: %v", err)
	}
}
