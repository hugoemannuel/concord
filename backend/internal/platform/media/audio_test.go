package media

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"
)

type fakeRoom bool

func (f fakeRoom) HasRoom(int64) bool { return bool(f) }

var oggBytes = "OggS" + strings.Repeat("\x00", 60)

func audioRequest(body, contentType string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	r.Header.Set("Content-Type", contentType)
	return r
}

func newAudioStore(t *testing.T) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func TestSaveAudio(t *testing.T) {
	onlyMP3 := func(ct string) bool { return ct == "audio/mpeg" }
	tests := []struct {
		name    string
		body    string
		room    bool
		limit   int64
		accept  func(string) bool
		wantErr error
	}{
		{"ogg aceito", oggBytes, true, 1024, nil, nil},
		{"não é áudio", "\x89PNG\r\n\x1a\n" + strings.Repeat("x", 40), true, 1024, nil, ErrNotAudio},
		{"tipo fora da lista", oggBytes, true, 1024, onlyMP3, ErrNotAudio},
		{"grande demais", oggBytes, true, 10, nil, ErrTooLarge},
		{"disco cheio", oggBytes, false, 1024, nil, syscall.ENOSPC},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newAudioStore(t)
			id, err := SaveAudio(store, fakeRoom(tt.room), audioRequest(tt.body, "audio/ogg"), tt.limit, tt.accept)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("erro = %v, quer %v", err, tt.wantErr)
			}
			files, _ := store.List()
			if tt.wantErr != nil && len(files) != 0 {
				t.Errorf("sobrou arquivo depois do erro: %v", files)
			}
			if tt.wantErr == nil && (len(files) != 1 || files[0].ID != id) {
				t.Errorf("arquivos = %v, quer só %s", files, id)
			}
		})
	}
}

func TestServeAudio(t *testing.T) {
	store := newAudioStore(t)
	id, err := SaveAudio(store, fakeRoom(true), audioRequest(oggBytes, "audio/ogg"), 1024, nil)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	if !ServeAudio(w, httptest.NewRequest(http.MethodGet, "/", nil), store, id) {
		t.Fatal("não serviu o áudio salvo")
	}
	if ct := w.Header().Get("Content-Type"); ct != "audio/ogg" {
		t.Errorf("Content-Type = %q", ct)
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("faltou nosniff")
	}
	if w.Body.String() != oggBytes {
		t.Error("corpo diferente do arquivo")
	}
}

func TestServeAudioNaoAchado(t *testing.T) {
	store := newAudioStore(t)
	w := httptest.NewRecorder()
	if ServeAudio(w, httptest.NewRequest(http.MethodGet, "/", nil), store, "8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e") {
		t.Error("serviu arquivo que não existe")
	}
}

func TestServeAudioRecusaQuemNaoEAudio(t *testing.T) {
	store := newAudioStore(t)
	id := "8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e"
	if _, _, err := store.Save(id, strings.NewReader("\x89PNG\r\n\x1a\n"+strings.Repeat("x", 40)), 1024); err != nil {
		t.Fatal(err)
	}
	if ServeAudio(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil), store, id) {
		t.Error("serviu imagem como áudio")
	}
}
