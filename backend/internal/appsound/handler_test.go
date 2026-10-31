package appsound

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

const meID = "11111111-1111-4111-8111-111111111111"

// fakeStore guarda tudo em memória (o SQL tem teste próprio com Postgres).
type fakeStore struct {
	settings map[string]Settings
	files    map[string]map[string]string
	failSet  bool
	failGet  bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{settings: map[string]Settings{}, files: map[string]map[string]string{}}
}

func (f *fakeStore) Settings(_ context.Context, userID string) (Settings, error) {
	if f.failGet {
		return Settings{}, errors.New("banco fora")
	}
	if s, ok := f.settings[userID]; ok {
		return s, nil
	}
	return DefaultSettings(), nil
}

func (f *fakeStore) SaveSettings(_ context.Context, userID string, s Settings) error {
	f.settings[userID] = s
	return nil
}

func (f *fakeStore) Files(_ context.Context, userID string) (map[string]string, error) {
	out := map[string]string{}
	for k, v := range f.files[userID] {
		out[k] = v
	}
	return out, nil
}

func (f *fakeStore) SetFile(_ context.Context, userID, event, fileID string, _ int) (string, error) {
	if f.failSet {
		return "", errors.New("banco fora")
	}
	if f.files[userID] == nil {
		f.files[userID] = map[string]string{}
	}
	old := f.files[userID][event]
	f.files[userID][event] = fileID
	return old, nil
}

func (f *fakeStore) RemoveFile(_ context.Context, userID, event string) (string, error) {
	old := f.files[userID][event]
	delete(f.files[userID], event)
	return old, nil
}

type roomy bool

func (r roomy) HasRoom(int64) bool { return bool(r) }

type env struct {
	router *gin.Engine
	repo   *fakeStore
	files  *media.Store
	h      *Handler
}

func newEnv(t *testing.T) *env {
	t.Helper()
	gin.SetMode(gin.TestMode)
	files, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	repo := newFakeStore()
	h := NewHandler(NewService(repo), files, roomy(true))
	r := gin.New()
	auth := func(c *gin.Context) { c.Set("userID", meID) }
	Routes(r.Group("/api"), h, auth)
	return &env{router: r, repo: repo, files: files, h: h}
}

func (e *env) do(method, path, body, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func decodeView(t *testing.T, w *httptest.ResponseRecorder) View {
	t.Helper()
	var v View
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("resposta não é JSON: %v (%s)", err, w.Body.String())
	}
	return v
}

var ogg = "OggS" + strings.Repeat("\x00", 60)

func TestGetSemNadaSalvoDevolveOPadrao(t *testing.T) {
	e := newEnv(t)
	w := e.do(http.MethodGet, "/api/users/me/app-sounds", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	v := decodeView(t, w)
	if v.Pack != DefaultPack || v.Volume != DefaultVolume || len(v.Events) != 0 || len(v.Custom) != 0 {
		t.Errorf("visão = %+v, quer o padrão", v)
	}
}

func TestSaveGuardaAsEscolhas(t *testing.T) {
	e := newEnv(t)
	body := `{"pack":"fliperama","volume":150,"events":{"mention":"cristal","mute":"off"}}`
	w := e.do(http.MethodPut, "/api/users/me/app-sounds", body, "application/json")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
	}
	v := decodeView(t, w)
	if v.Pack != "fliperama" || v.Volume != 150 || v.Events["mention"] != "cristal" || v.Events["mute"] != "off" {
		t.Errorf("visão = %+v", v)
	}
}

func TestSaveSemEventsGravaMapaVazio(t *testing.T) {
	e := newEnv(t)
	w := e.do(http.MethodPut, "/api/users/me/app-sounds", `{"pack":"salinha","volume":100}`, "application/json")
	if w.Code != http.StatusOK || e.repo.settings[meID].Events == nil {
		t.Fatalf("status = %d, events = %v", w.Code, e.repo.settings[meID].Events)
	}
}

func TestSaveRecusaEscolhaInvalida(t *testing.T) {
	tests := []struct{ name, body string }{
		{"volume alto demais", `{"pack":"salinha","volume":201,"events":{}}`},
		{"volume negativo", `{"pack":"salinha","volume":-1,"events":{}}`},
		{"pacote fora do formato", `{"pack":"../x","volume":100,"events":{}}`},
		{"pacote vazio", `{"pack":"","volume":100,"events":{}}`},
		{"evento desconhecido", `{"pack":"salinha","volume":100,"events":{"levelChime":"off"}}`},
		{"escolha fora do formato", `{"pack":"salinha","volume":100,"events":{"mute":"OFF!"}}`},
		{"corpo quebrado", `{`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t)
			if w := e.do(http.MethodPut, "/api/users/me/app-sounds", tt.body, "application/json"); w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, quer 400", w.Code)
			}
			if _, saved := e.repo.settings[meID]; saved {
				t.Error("salvou escolha inválida")
			}
		})
	}
}

func TestUploadGravaEDevolveAURL(t *testing.T) {
	e := newEnv(t)
	w := e.do(http.MethodPost, "/api/users/me/app-sounds/mention?duration_ms=800", ogg, "audio/ogg")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
	}
	id := e.repo.files[meID]["mention"]
	if got := decodeView(t, w).Custom["mention"]; got != "/api/app-sounds/"+id {
		t.Errorf("url = %q, quer a do arquivo %s", got, id)
	}
	if f, err := e.files.Open(id); err != nil {
		t.Errorf("arquivo não ficou no disco: %v", err)
	} else {
		f.Close()
	}
}

func TestUploadTrocaApagaOAnterior(t *testing.T) {
	e := newEnv(t)
	e.do(http.MethodPost, "/api/users/me/app-sounds/mute?duration_ms=500", ogg, "audio/ogg")
	first := e.repo.files[meID]["mute"]
	e.do(http.MethodPost, "/api/users/me/app-sounds/mute?duration_ms=500", ogg, "audio/ogg")
	if _, err := e.files.Open(first); err == nil {
		t.Error("o arquivo anterior continuou no disco")
	}
	if files, _ := e.files.List(); len(files) != 1 {
		t.Errorf("arquivos = %d, quer 1", len(files))
	}
}

func TestUploadRecusa(t *testing.T) {
	webm := "\x1a\x45\xdf\xa3" + strings.Repeat("\x00", 8) + "webm" + strings.Repeat("\x00", 40)
	tests := []struct {
		name, path, body, contentType string
		room                          bool
		want                          int
	}{
		{"evento desconhecido", "/api/users/me/app-sounds/levelChime?duration_ms=500", ogg, "audio/ogg", true, 404},
		{"sem duração", "/api/users/me/app-sounds/mute", ogg, "audio/ogg", true, 400},
		{"longo demais", "/api/users/me/app-sounds/mute?duration_ms=5001", ogg, "audio/ogg", true, 400},
		{"curto demais", "/api/users/me/app-sounds/mute?duration_ms=99", ogg, "audio/ogg", true, 400},
		{"não é áudio", "/api/users/me/app-sounds/mute?duration_ms=500", "\x89PNG\r\n\x1a\n" + strings.Repeat("x", 40), "audio/ogg", true, 415},
		{"webm fica de fora", "/api/users/me/app-sounds/mute?duration_ms=500", webm, "audio/webm", true, 415},
		{"grande demais", "/api/users/me/app-sounds/mute?duration_ms=500", ogg + strings.Repeat("\x00", 200), "audio/ogg", true, 413},
		{"disco cheio", "/api/users/me/app-sounds/mute?duration_ms=500", ogg, "audio/ogg", false, 507},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t)
			e.h.maxBytes = 128
			e.h.space = roomy(tt.room)
			if w := e.do(http.MethodPost, tt.path, tt.body, tt.contentType); w.Code != tt.want {
				t.Errorf("status = %d, quer %d (%s)", w.Code, tt.want, w.Body.String())
			}
			if files, _ := e.files.List(); len(files) != 0 {
				t.Errorf("sobrou arquivo: %v", files)
			}
		})
	}
}

func TestUploadFalhaNoBancoApagaOArquivo(t *testing.T) {
	e := newEnv(t)
	e.repo.failSet = true
	if w := e.do(http.MethodPost, "/api/users/me/app-sounds/mute?duration_ms=500", ogg, "audio/ogg"); w.Code != 500 {
		t.Errorf("status = %d, quer 500", w.Code)
	}
	if files, _ := e.files.List(); len(files) != 0 {
		t.Errorf("sobrou arquivo: %v", files)
	}
}

func TestDeleteApagaArquivoEURL(t *testing.T) {
	e := newEnv(t)
	e.do(http.MethodPost, "/api/users/me/app-sounds/knock?duration_ms=500", ogg, "audio/ogg")
	id := e.repo.files[meID]["knock"]
	w := e.do(http.MethodDelete, "/api/users/me/app-sounds/knock", "", "")
	if w.Code != http.StatusOK || len(decodeView(t, w).Custom) != 0 {
		t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
	}
	if _, err := e.files.Open(id); err == nil {
		t.Error("o arquivo continuou no disco")
	}
	if w := e.do(http.MethodDelete, "/api/users/me/app-sounds/knock", "", ""); w.Code != http.StatusOK {
		t.Errorf("apagar de novo: status = %d, quer 200", w.Code)
	}
	if w := e.do(http.MethodDelete, "/api/users/me/app-sounds/nada", "", ""); w.Code != http.StatusNotFound {
		t.Errorf("evento desconhecido: status = %d, quer 404", w.Code)
	}
}

func TestServe(t *testing.T) {
	e := newEnv(t)
	e.do(http.MethodPost, "/api/users/me/app-sounds/ring?duration_ms=1500", ogg, "audio/ogg")
	id := e.repo.files[meID]["ring"]
	w := e.do(http.MethodGet, "/api/app-sounds/"+id, "", "")
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "audio/ogg" {
		t.Errorf("status = %d, tipo = %q", w.Code, w.Header().Get("Content-Type"))
	}
	for _, bad := range []string{"nao-e-uuid", "8F14E45F-CEEA-4E7A-9F6B-1F3A2B4C5D6E", "8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e"} {
		if w := e.do(http.MethodGet, "/api/app-sounds/"+bad, "", ""); w.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, quer 404", bad, w.Code)
		}
	}
}

func TestBancoForaResponde500(t *testing.T) {
	e := newEnv(t)
	e.repo.failGet = true
	if w := e.do(http.MethodGet, "/api/users/me/app-sounds", "", ""); w.Code != 500 {
		t.Errorf("GET: status = %d, quer 500", w.Code)
	}
	if w := e.do(http.MethodDelete, "/api/users/me/app-sounds/mute", "", ""); w.Code != 500 {
		t.Errorf("DELETE: status = %d, quer 500", w.Code)
	}
}
