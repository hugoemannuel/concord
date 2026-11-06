package sticker

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
	"syscall"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

type mockRepo struct {
	stickers map[string]*Sticker
}

func newMockRepo() *mockRepo {
	return &mockRepo{stickers: make(map[string]*Sticker)}
}

func (m *mockRepo) Create(ctx context.Context, s *Sticker) error {
	s.CreatedAt = time.Now()
	copied := *s
	m.stickers[s.ID] = &copied
	return nil
}

func (m *mockRepo) ListByServer(ctx context.Context, serverID string) ([]Sticker, error) {
	res := []Sticker{}
	for _, s := range m.stickers {
		if s.ServerID == serverID {
			res = append(res, *s)
		}
	}
	return res, nil
}

func (m *mockRepo) ListForUser(ctx context.Context, userID string) ([]ServerStickers, error) {
	g := ServerStickers{ServerID: "srv-1", ServerName: "Salinha"}
	for _, s := range m.stickers {
		g.Stickers = append(g.Stickers, *s)
	}
	return []ServerStickers{g}, nil
}

func (m *mockRepo) FindByID(ctx context.Context, id string) (*Sticker, error) {
	if s, ok := m.stickers[id]; ok {
		copied := *s
		return &copied, nil
	}
	return nil, ErrStickerNotFound
}

func (m *mockRepo) CountByServer(ctx context.Context, serverID string) (int, error) {
	count := 0
	for _, s := range m.stickers {
		if s.ServerID == serverID {
			count++
		}
	}
	return count, nil
}

func (m *mockRepo) Delete(ctx context.Context, id string) error {
	if _, ok := m.stickers[id]; !ok {
		return ErrStickerNotFound
	}
	delete(m.stickers, id)
	return nil
}

type mockServerChecker struct {
	members map[string]bool
}

func (m *mockServerChecker) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return m.members[serverID+":"+userID], nil
}

type mockPermChecker struct {
	perms map[string]int64
}

func (m *mockPermChecker) ServerPerms(_ context.Context, serverID, userID string) (int64, error) {
	return m.perms[serverID+":"+userID], nil
}

type mockSpace struct {
	hasRoom bool
}

func (m *mockSpace) HasRoom(int64) bool { return m.hasRoom }

type mockTokens struct {
	users map[string]string
}

func (m *mockTokens) VerifyMediaToken(token string) (string, error) {
	if u, ok := m.users[token]; ok {
		return u, nil
	}
	return "", errors.New("invalid token")
}

type mockPublisher struct {
	events []struct {
		room string
		raw  []byte
	}
}

func (m *mockPublisher) BroadcastToRoom(room string, event []byte) {
	m.events = append(m.events, struct {
		room string
		raw  []byte
	}{room: room, raw: event})
}

var validPNG, _ = base64.StdEncoding.DecodeString(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
)

func buildStickerRouter(t *testing.T) (*gin.Engine, *Handler, *mockRepo, *mockPublisher) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	repo := newMockRepo()
	servers := &mockServerChecker{
		members: map[string]bool{
			"srv-1:ana":  true,
			"srv-1:bia":  true,
			"srv-1:mod":  true,
			"srv-1:cris": true,
		},
	}
	perms := &mockPermChecker{
		perms: map[string]int64{
			"srv-1:ana": permission.AddStickers,
			"srv-1:bia": permission.AddStickers,
			"srv-1:mod": permission.ManageExpressions | permission.AddStickers,
			// cris é membro, mas sem ADD_STICKERS.
		},
	}
	space := &mockSpace{hasRoom: true}
	tokens := &mockTokens{
		users: map[string]string{
			"tok-ana":      "ana",
			"tok-bia":      "bia",
			"tok-outsider": "outsider",
		},
	}
	pub := &mockPublisher{}
	h := NewHandler(repo, store, space, servers, perms, tokens, pub)

	r := gin.New()
	api := r.Group("/api")
	Routes(api, h, func(c *gin.Context) {
		if u := c.GetHeader("X-User"); u != "" {
			c.Set("userID", u)
		}
		c.Next()
	})
	return r, h, repo, pub
}

func makeMultipartReq(t *testing.T, url, name, contentType string, fileBytes []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if name != "" {
		_ = mw.WriteField("name", name)
	}
	if fileBytes != nil {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", `form-data; name="file"; filename="stk.png"`)
		h.Set("Content-Type", contentType)
		part, err := mw.CreatePart(h)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write(fileBytes)
	}
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, url, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func TestSanitizeName(t *testing.T) {
	t.Parallel()

	valid, err := sanitizeName("  Legal! ")
	if err != nil || valid != "Legal!" {
		t.Fatalf("expected 'Legal!', got %q (err: %v)", valid, err)
	}

	_, err = sanitizeName("")
	if !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected ErrInvalidName for empty, got %v", err)
	}

	tooLong := "123456789012345678901234567890123" // 33 chars
	_, err = sanitizeName(tooLong)
	if !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected ErrInvalidName for too long, got %v", err)
	}
}

func TestMockRepo(t *testing.T) {
	t.Parallel()
	repo := newMockRepo()
	ctx := context.Background()

	stk := &Sticker{
		ID:          "stk-1",
		ServerID:    "srv-1",
		UploaderID:  "usr-1",
		Name:        "smile",
		ContentType: "image/webp",
		SizeBytes:   1234,
	}

	if err := repo.Create(ctx, stk); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	found, err := repo.FindByID(ctx, "stk-1")
	if err != nil || found.Name != "smile" {
		t.Fatalf("find failed: %v, got %+v", err, found)
	}

	count, _ := repo.CountByServer(ctx, "srv-1")
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	list, _ := repo.ListByServer(ctx, "srv-1")
	if len(list) != 1 {
		t.Fatalf("expected list len 1, got %d", len(list))
	}

	if err := repo.Delete(ctx, "stk-1"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	_, err = repo.FindByID(ctx, "stk-1")
	if !errors.Is(err, ErrStickerNotFound) {
		t.Fatalf("expected ErrStickerNotFound, got %v", err)
	}
}

func TestStickerHTTPFlowAndPermissions(t *testing.T) {
	t.Parallel()
	r, h, repo, pub := buildStickerRouter(t)

	// 1. Non-member cannot upload or list
	reqOut := makeMultipartReq(t, "/api/servers/srv-1/stickers", "doge", "image/png", validPNG)
	reqOut.Header.Set("X-User", "outsider")
	recOut := httptest.NewRecorder()
	r.ServeHTTP(recOut, reqOut)
	if recOut.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for outsider upload, got %d", recOut.Code)
	}

	// 2. Unsupported file type rejected (415)
	reqBadType := makeMultipartReq(t, "/api/servers/srv-1/stickers", "bad", "text/plain", []byte("not an image"))
	reqBadType.Header.Set("X-User", "ana")
	recBadType := httptest.NewRecorder()
	r.ServeHTTP(recBadType, reqBadType)
	if recBadType.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415 for text/plain, got %d: %s", recBadType.Code, recBadType.Body.String())
	}

	// 3. Valid upload by member Ana succeeds (201) and broadcasts WS event with {"type", "payload"}
	reqUp := makeMultipartReq(t, "/api/servers/srv-1/stickers", "doge_cool", "image/png", validPNG)
	reqUp.Header.Set("X-User", "ana")
	recUp := httptest.NewRecorder()
	r.ServeHTTP(recUp, reqUp)
	if recUp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recUp.Code, recUp.Body.String())
	}
	var created Sticker
	if err := json.Unmarshal(recUp.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Name != "doge_cool" || created.ServerID != "srv-1" || created.UploaderID != "ana" {
		t.Fatalf("unexpected created sticker: %+v", created)
	}
	if len(pub.events) != 1 || pub.events[0].room != "server:srv-1" {
		t.Fatalf("expected 1 WS broadcast to server:srv-1, got %+v", pub.events)
	}
	var wsEnvelope struct {
		Type    string       `json:"type"`
		Payload CreatedEvent `json:"payload"`
	}
	if err := json.Unmarshal(pub.events[0].raw, &wsEnvelope); err != nil {
		t.Fatal(err)
	}
	if wsEnvelope.Type != "sticker:created" || wsEnvelope.Payload.Sticker.ID != created.ID {
		t.Fatalf("unexpected WS envelope: %+v", wsEnvelope)
	}

	// 4. ServeFile works for member with valid media token, fails for outsider or bad token
	reqFile := httptest.NewRequest(http.MethodGet, "/api/stickers/"+created.ID+"/file?token=tok-bia", nil)
	recFile := httptest.NewRecorder()
	r.ServeHTTP(recFile, reqFile)
	if recFile.Code != http.StatusOK || !bytes.Equal(recFile.Body.Bytes(), validPNG) {
		t.Fatalf("expected 200 and PNG bytes, got %d (%d bytes)", recFile.Code, recFile.Body.Len())
	}

	reqFileOut := httptest.NewRequest(http.MethodGet, "/api/stickers/"+created.ID+"/file?token=tok-outsider", nil)
	recFileOut := httptest.NewRecorder()
	r.ServeHTTP(recFileOut, reqFileOut)
	if recFileOut.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for outsider file download, got %d", recFileOut.Code)
	}

	// Publicada (usada fora do servidor): quem não é membro passa a ver.
	now := time.Now()
	repo.stickers[created.ID].PublishedAt = &now
	reqFilePub := httptest.NewRequest(http.MethodGet, "/api/stickers/"+created.ID+"/file?token=tok-outsider", nil)
	recFilePub := httptest.NewRecorder()
	r.ServeHTTP(recFilePub, reqFilePub)
	if recFilePub.Code != http.StatusOK {
		t.Fatalf("expected 200 for outsider on published sticker, got %d", recFilePub.Code)
	}
	repo.stickers[created.ID].PublishedAt = nil

	reqFileBadTok := httptest.NewRequest(http.MethodGet, "/api/stickers/"+created.ID+"/file?token=invalid", nil)
	recFileBadTok := httptest.NewRecorder()
	r.ServeHTTP(recFileBadTok, reqFileBadTok)
	if recFileBadTok.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid token, got %d", recFileBadTok.Code)
	}

	// 5. Regular member Bia (not uploader, no ManageExpressions) cannot delete Ana's sticker (403)
	reqDelBia := httptest.NewRequest(http.MethodDelete, "/api/servers/srv-1/stickers/"+created.ID, nil)
	reqDelBia.Header.Set("X-User", "bia")
	recDelBia := httptest.NewRecorder()
	r.ServeHTTP(recDelBia, reqDelBia)
	if recDelBia.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when Bia tries to delete Ana's sticker, got %d", recDelBia.Code)
	}

	// 6. Moderator with ManageExpressions CAN delete Ana's sticker (200) and broadcasts sticker:deleted
	reqDelMod := httptest.NewRequest(http.MethodDelete, "/api/servers/srv-1/stickers/"+created.ID, nil)
	reqDelMod.Header.Set("X-User", "mod")
	recDelMod := httptest.NewRecorder()
	r.ServeHTTP(recDelMod, reqDelMod)
	if recDelMod.Code != http.StatusOK {
		t.Fatalf("expected 200 when moderator deletes sticker, got %d: %s", recDelMod.Code, recDelMod.Body.String())
	}
	if len(pub.events) != 2 {
		t.Fatalf("expected 2 WS events, got %d", len(pub.events))
	}
	var delEnvelope struct {
		Type    string       `json:"type"`
		Payload DeletedEvent `json:"payload"`
	}
	_ = json.Unmarshal(pub.events[1].raw, &delEnvelope)
	if delEnvelope.Type != "sticker:deleted" || delEnvelope.Payload.StickerID != created.ID {
		t.Fatalf("unexpected delete WS envelope: %+v", delEnvelope)
	}

	// 7. Server limit (maxPerServer) returns 409 Conflict
	h.maxPerServer = 0
	reqFull := makeMultipartReq(t, "/api/servers/srv-1/stickers", "extra", "image/png", validPNG)
	reqFull.Header.Set("X-User", "ana")
	recFull := httptest.NewRecorder()
	r.ServeHTTP(recFull, reqFull)
	if recFull.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict when server is full, got %d", recFull.Code)
	}
}

func TestStickerUploadRequiresAddStickers(t *testing.T) {
	t.Parallel()
	r, _, repo, _ := buildStickerRouter(t)
	req := makeMultipartReq(t, "/api/servers/srv-1/stickers", "doge", "image/png", validPNG)
	req.Header.Set("X-User", "cris")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "missing_permission") ||
		!strings.Contains(rec.Body.String(), ErrCannotAddSticker.Error()) {
		t.Fatalf("status = %d (%s), want 403 missing_permission com a mensagem clara", rec.Code, rec.Body.String())
	}
	if len(repo.stickers) != 0 {
		t.Fatal("a figurinha não devia ser salva")
	}
}

func TestFormError(t *testing.T) {
	t.Parallel()
	cases := map[error]int{
		media.ErrMissingFile:                     http.StatusBadRequest,
		fmt.Errorf("%w: lixo", media.ErrBadForm): http.StatusBadRequest,
		media.ErrTooLarge:                        http.StatusRequestEntityTooLarge,
		fmt.Errorf("gravar: %w", syscall.ENOSPC): http.StatusInsufficientStorage,
		errors.New("disco quebrado"):             http.StatusInternalServerError,
	}
	for err, want := range cases {
		if got := formError(err).status; got != want {
			t.Errorf("%v: status = %d, want %d", err, got, want)
		}
	}
}

func TestListMine(t *testing.T) {
	r, _, repo, _ := buildStickerRouter(t)
	repo.stickers["stk-1"] = &Sticker{ID: "stk-1", ServerID: "srv-1", Name: "gato"}

	req := httptest.NewRequest(http.MethodGet, "/api/stickers", nil)
	req.Header.Set("X-User", "ana")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var groups []ServerStickers
	if err := json.Unmarshal(rec.Body.Bytes(), &groups); err != nil || len(groups) != 1 || groups[0].Stickers[0].Name != "gato" {
		t.Fatalf("%v %s", err, rec.Body.String())
	}
}
