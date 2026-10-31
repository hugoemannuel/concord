package emoji

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

type mockRepo struct {
	emojis map[string]*Emoji
}

func (m *mockRepo) Create(_ context.Context, e *Emoji) error {
	for _, x := range m.emojis {
		if x.ServerID == e.ServerID && strings.EqualFold(x.Name, e.Name) {
			return ErrNameTaken
		}
	}
	e.CreatedAt = time.Now()
	copied := *e
	m.emojis[e.ID] = &copied
	return nil
}

func (m *mockRepo) ListForUser(_ context.Context, userID string) ([]ServerEmojis, error) {
	if userID != "ana" {
		return []ServerEmojis{}, nil
	}
	g := ServerEmojis{ServerID: "srv-1", ServerName: "Salinha"}
	for _, e := range m.emojis {
		g.Emojis = append(g.Emojis, *e)
	}
	return []ServerEmojis{g}, nil
}

func (m *mockRepo) FindByID(_ context.Context, id string) (*Emoji, error) {
	if e, ok := m.emojis[id]; ok {
		copied := *e
		return &copied, nil
	}
	return nil, ErrEmojiNotFound
}

func (m *mockRepo) CountByServer(_ context.Context, serverID string) (int, error) {
	n := 0
	for _, e := range m.emojis {
		if e.ServerID == serverID {
			n++
		}
	}
	return n, nil
}

func (m *mockRepo) Delete(_ context.Context, id string) error {
	if _, ok := m.emojis[id]; !ok {
		return ErrEmojiNotFound
	}
	delete(m.emojis, id)
	return nil
}

type fakeAccess struct {
	members map[string]bool
	perms   map[string]int64
}

func (f *fakeAccess) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return f.members[serverID+":"+userID], nil
}

func (f *fakeAccess) ServerPerms(_ context.Context, serverID, userID string) (int64, error) {
	return f.perms[serverID+":"+userID], nil
}

type fakeSpace struct{}

func (fakeSpace) HasRoom(int64) bool { return true }

type fakeTokens map[string]string

func (f fakeTokens) VerifyMediaToken(token string) (string, error) {
	if u, ok := f[token]; ok {
		return u, nil
	}
	return "", errors.New("invalid token")
}

type fakePublisher struct{ rooms []string }

func (f *fakePublisher) BroadcastToRoom(room string, _ []byte) { f.rooms = append(f.rooms, room) }

var pngBytes, _ = base64.StdEncoding.DecodeString(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
)

// avifHead: começo de um AVIF (caixa ftyp com a marca "avif").
var avifHead = append([]byte{0, 0, 0, 0x1c, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f', 0, 0, 0, 0}, make([]byte, 64)...)

type env struct {
	router *gin.Engine
	repo   *mockRepo
	pub    *fakePublisher
	h      *Handler
}

func newEnv(t *testing.T) env {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	repo := &mockRepo{emojis: map[string]*Emoji{}}
	access := &fakeAccess{
		members: map[string]bool{"srv-1:ana": true, "srv-1:bia": true, "srv-1:mod": true, "srv-1:cris": true},
		perms: map[string]int64{
			"srv-1:ana": permission.AddEmojis,
			"srv-1:bia": permission.AddEmojis,
			"srv-1:mod": permission.AddEmojis | permission.ManageExpressions,
		},
	}
	pub := &fakePublisher{}
	h := NewHandler(repo, store, fakeSpace{}, access, access, fakeTokens{"tok-ana": "ana", "tok-fora": "fora"}, pub)
	r := gin.New()
	Routes(r.Group("/api"), h, NewBaseHandler(NewBaseService("http://127.0.0.1:1")), func(c *gin.Context) {
		if u := c.GetHeader("X-User"); u != "" {
			c.Set("userID", u)
		}
		c.Next()
	})
	return env{router: r, repo: repo, pub: pub, h: h}
}

func (e env) upload(t *testing.T, user, name string, file []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("name", name)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="file"; filename="e.png"`)
	h.Set("Content-Type", "application/octet-stream")
	part, _ := mw.CreatePart(h)
	_, _ = part.Write(file)
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/servers/srv-1/emojis", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-User", user)
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func (e env) do(method, url, user string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, nil)
	if user != "" {
		req.Header.Set("X-User", user)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func errorOf(w *httptest.ResponseRecorder) string {
	var body struct{ Error string }
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return body.Error
}

func TestValidName(t *testing.T) {
	for _, ok := range []string{"ok", "kkk_2", strings.Repeat("a", 32)} {
		if !validName(ok) {
			t.Errorf("%q deveria valer", ok)
		}
	}
	for _, bad := range []string{"", "a", "com espaço", "ação", "a-b", strings.Repeat("a", 33)} {
		if validName(bad) {
			t.Errorf("%q não deveria valer", bad)
		}
	}
}

func TestUploadCriaEAvisaOServidor(t *testing.T) {
	e := newEnv(t)
	w := e.upload(t, "ana", "festa", pngBytes)
	if w.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var created Emoji
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if created.Name != "festa" || created.ContentType != "image/png" || created.ServerID != "srv-1" {
		t.Fatalf("emoji criado errado: %+v", created)
	}
	if len(e.pub.rooms) != 1 || e.pub.rooms[0] != "server:srv-1" {
		t.Fatalf("evento esperado na sala do servidor, veio %v", e.pub.rooms)
	}
}

func TestUploadAceitaAVIF(t *testing.T) {
	e := newEnv(t)
	w := e.upload(t, "ana", "avif_ok", avifHead)
	if w.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var created Emoji
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if created.ContentType != "image/avif" {
		t.Fatalf("content type = %q", created.ContentType)
	}
}

func TestIsAVIF(t *testing.T) {
	compat := append([]byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'm', 'i', 'f', '1', 0, 0, 0, 0, 'm', 'i', 'f', '1', 'a', 'v', 'i', 'f'}, make([]byte, 8)...)
	if !isAVIF(avifHead) || !isAVIF(compat) {
		t.Fatal("AVIF pela marca principal e pela compatível")
	}
	heic := []byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c', 0, 0, 0, 0, 'm', 'i', 'f', '1', 'h', 'e', 'i', 'c'}
	if isAVIF(heic) || isAVIF(pngBytes[:8]) {
		t.Fatal("HEIC e cabeçalho curto não são AVIF")
	}
}

func TestUploadRecusa(t *testing.T) {
	big := append(append([]byte{}, pngBytes...), make([]byte, MaxEmojiBytes)...)
	cases := []struct {
		nome, user, name string
		file             []byte
		status           int
		err              error
	}{
		{"nome inválido", "ana", "a b", pngBytes, http.StatusBadRequest, ErrInvalidName},
		{"sem permissão", "cris", "festa", pngBytes, http.StatusForbidden, ErrCannotAddEmoji},
		{"não membro", "fora", "festa", pngBytes, http.StatusForbidden, ErrNotServerMember},
		{"texto", "ana", "texto", []byte("isto é só texto"), http.StatusUnsupportedMediaType, ErrUnsupportedImage},
		{"grande demais", "ana", "grande", big, http.StatusRequestEntityTooLarge, ErrTooLarge},
	}
	for _, c := range cases {
		t.Run(c.nome, func(t *testing.T) {
			e := newEnv(t)
			w := e.upload(t, c.user, c.name, c.file)
			if w.Code != c.status || errorOf(w) != c.err.Error() {
				t.Fatalf("status %d (%q), want %d (%q)", w.Code, errorOf(w), c.status, c.err)
			}
		})
	}
}

func TestUploadNomeRepetidoEServidorCheio(t *testing.T) {
	e := newEnv(t)
	if w := e.upload(t, "ana", "festa", pngBytes); w.Code != http.StatusCreated {
		t.Fatalf("primeiro upload: %d", w.Code)
	}
	if w := e.upload(t, "bia", "FESTA", pngBytes); w.Code != http.StatusConflict || errorOf(w) != ErrNameTaken.Error() {
		t.Fatalf("nome repetido: %d %q", w.Code, errorOf(w))
	}
	for i := len(e.repo.emojis); i < MaxEmojisPerServer; i++ {
		id := fmt.Sprintf("x%d", i)
		e.repo.emojis[id] = &Emoji{ID: id, ServerID: "srv-1", Name: id}
	}
	if w := e.upload(t, "ana", "mais_um", pngBytes); w.Code != http.StatusConflict || errorOf(w) != ErrServerFull.Error() {
		t.Fatalf("servidor cheio: %d %q", w.Code, errorOf(w))
	}
}

func TestListMine(t *testing.T) {
	e := newEnv(t)
	e.upload(t, "ana", "festa", pngBytes)
	w := e.do(http.MethodGet, "/api/emojis", "ana")
	var groups []ServerEmojis
	_ = json.Unmarshal(w.Body.Bytes(), &groups)
	if w.Code != http.StatusOK || len(groups) != 1 || len(groups[0].Emojis) != 1 {
		t.Fatalf("status %d, grupos %+v", w.Code, groups)
	}
	if w := e.do(http.MethodGet, "/api/emojis", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("sem login: %d", w.Code)
	}
}

func TestServeFileSoParaMembro(t *testing.T) {
	e := newEnv(t)
	var created Emoji
	_ = json.Unmarshal(e.upload(t, "ana", "festa", pngBytes).Body.Bytes(), &created)

	w := e.do(http.MethodGet, "/api/emojis/"+created.ID+"/file?token=tok-ana", "")
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("membro: %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Fatalf("Cache-Control = %q, want immutable", cc)
	}
	if w := e.do(http.MethodGet, "/api/emojis/"+created.ID+"/file?token=tok-fora", ""); w.Code != http.StatusNotFound {
		t.Fatalf("não membro: %d", w.Code)
	}
	if w := e.do(http.MethodGet, "/api/emojis/"+created.ID+"/file?token=ruim", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("token ruim: %d", w.Code)
	}
	if w := e.do(http.MethodGet, "/api/emojis/nao-existe/file?token=tok-ana", ""); w.Code != http.StatusNotFound {
		t.Fatalf("inexistente: %d", w.Code)
	}
}

func TestDelete(t *testing.T) {
	e := newEnv(t)
	var created Emoji
	_ = json.Unmarshal(e.upload(t, "ana", "festa", pngBytes).Body.Bytes(), &created)
	url := "/api/servers/srv-1/emojis/" + created.ID

	if w := e.do(http.MethodDelete, url, "bia"); w.Code != http.StatusForbidden {
		t.Fatalf("terceiro sem MANAGE_EXPRESSIONS: %d", w.Code)
	}
	if w := e.do(http.MethodDelete, "/api/servers/srv-2/emojis/"+created.ID, "ana"); w.Code != http.StatusNotFound {
		t.Fatalf("servidor errado: %d", w.Code)
	}
	if w := e.do(http.MethodDelete, url, "mod"); w.Code != http.StatusOK {
		t.Fatalf("moderador: %d", w.Code)
	}
	if _, ok := e.repo.emojis[created.ID]; ok {
		t.Fatal("emoji continuou no repositório")
	}
	if w := e.do(http.MethodDelete, url, "ana"); w.Code != http.StatusNotFound {
		t.Fatalf("já apagado: %d", w.Code)
	}
	if len(e.pub.rooms) != 2 {
		t.Fatalf("esperava eventos de criado e apagado, veio %v", e.pub.rooms)
	}
}
