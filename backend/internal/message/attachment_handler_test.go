package message

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

type fakeAttachmentRepo struct {
	rows      map[string]*storedAttachment
	createErr error
}

func (r *fakeAttachmentRepo) CreatePendingAttachment(_ context.Context, a *storedAttachment) error {
	if r.createErr != nil {
		return r.createErr
	}
	copied := *a
	r.rows[a.ID] = &copied
	return nil
}

func (r *fakeAttachmentRepo) FindAttachment(_ context.Context, id string) (*storedAttachment, error) {
	a, ok := r.rows[id]
	if !ok {
		return nil, ErrAttachmentNotFound
	}
	return a, nil
}

type fakeAccess struct {
	readErr, writeErr error
}

func (a fakeAccess) CanRead(context.Context, Room, string) error  { return a.readErr }
func (a fakeAccess) CanWrite(context.Context, Room, string) error { return a.writeErr }

type fakeSpace struct{ ok bool }

func (s fakeSpace) HasRoom(int64) bool { return s.ok }

type fakeTokens struct{}

func (fakeTokens) GenerateMediaToken(userID string) (string, time.Time, error) {
	return "bom", time.Now().Add(time.Hour), nil
}

func (fakeTokens) VerifyMediaToken(token string) (string, error) {
	if token == "bom" {
		return "u1", nil
	}
	return "", errors.New("invalid token")
}

type attachmentEnv struct {
	router *gin.Engine
	h      *AttachmentHandler
	repo   *fakeAttachmentRepo
	store  *media.Store
}

func newAttachmentEnv(t *testing.T, access fakeAccess, space fakeSpace) *attachmentEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	repo := &fakeAttachmentRepo{rows: map[string]*storedAttachment{}}
	h := NewAttachmentHandler(repo, store, space, access, fakeTokens{})
	router := gin.New()
	fakeAuth := func(c *gin.Context) {
		c.Set("userID", "u1")
		c.Next()
	}
	AttachmentRoutes(router.Group("/api"), h, fakeAuth)
	return &attachmentEnv{router: router, h: h, repo: repo, store: store}
}

// multipartBody monta o corpo do upload: campos e uma parte "file" com
// Content-Type explícito.
func multipartBody(t *testing.T, fields map[string]string, filename, contentType string, data []byte) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+strings.ReplaceAll(filename, `\`, `\\`)+`"`)
	header.Set("Content-Type", contentType)
	part, err := w.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	part.Write(data)
	w.Close()
	return body, w.FormDataContentType()
}

func pngBytes(n int) []byte {
	data := []byte("\x89PNG\r\n\x1a\n")
	return append(data, bytes.Repeat([]byte{0x42}, n-len(data))...)
}

func (e *attachmentEnv) upload(t *testing.T, path string, fields map[string]string, filename, contentType string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	body, ctype := multipartBody(t, fields, filename, contentType, data)
	req := httptest.NewRequest(http.MethodPost, path, body)
	req.Header.Set("Content-Type", ctype)
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func (e *attachmentEnv) assertDiskEmpty(t *testing.T) {
	t.Helper()
	files, err := e.store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Fatalf("disco deveria estar vazio, tem %+v", files)
	}
}

func TestUploadStoresImageAsPending(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	data := pngBytes(108)
	rec := env.upload(t, "/api/channels/c1/attachments", map[string]string{"width": "640", "height": "480"}, "foto.png", "image/png", data)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got Attachment
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Kind != "image" || got.ContentType != "image/png" || got.Width == nil || *got.Width != 640 || got.SizeBytes != int64(len(data)) {
		t.Fatalf("resposta = %+v", got)
	}
	row := env.repo.rows[got.ID]
	if row == nil || row.ChannelID == nil || *row.ChannelID != "c1" || row.ConversationID != nil || row.UploaderID != "u1" || row.MessageID != nil {
		t.Fatalf("linha = %+v", row)
	}
	f, err := env.store.Open(got.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	saved, _ := io.ReadAll(f)
	if !bytes.Equal(saved, data) {
		t.Fatal("bytes salvos diferentes")
	}
}

func TestUploadToConversationSetsConversation(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	rec := env.upload(t, "/api/conversations/d1/attachments", nil, "foto.png", "image/png", pngBytes(108))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got Attachment
	json.Unmarshal(rec.Body.Bytes(), &got)
	row := env.repo.rows[got.ID]
	if row == nil || row.ConversationID == nil || *row.ConversationID != "d1" || row.ChannelID != nil {
		t.Fatalf("linha = %+v", row)
	}
}

func TestUploadRejectsTooLarge(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	env.h.maxFileBytes = 1024
	rec := env.upload(t, "/api/channels/c1/attachments", nil, "foto.png", "image/png", pngBytes(1025))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	env.assertDiskEmpty(t)
}

// uploadKind sobe um arquivo e devolve o anexo criado (falha se não for 201).
func (e *attachmentEnv) uploadKind(t *testing.T, filename, declared string, data []byte) Attachment {
	t.Helper()
	rec := e.upload(t, "/api/channels/c1/attachments", nil, filename, declared, data)
	if rec.Code != http.StatusCreated {
		t.Fatalf("%s: status = %d, body = %s", filename, rec.Code, rec.Body.String())
	}
	var got Attachment
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got
}

// Qualquer arquivo é aceito, como no Discord: o que não é mídia vira "file",
// e o tipo vem dos bytes, nunca do que o cliente declarou.
func TestUploadAcceptsAnyFileAsFile(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	cases := []struct {
		filename, declared string
		data               []byte
		wantType           string
	}{
		{"pacote.zip", "application/zip", []byte("PK\x03\x04\x14\x00\x00\x00"), "application/octet-stream"},
		{"notas.md", "text/markdown", []byte("# Notas\n\nação\n"), "text/plain; charset=utf-8"},
		// SVG declarado como PNG: antes 415; agora é texto e só baixa (attachment).
		{"foto.png", "image/png", []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), "text/plain; charset=utf-8"},
		{"lixo.txt", "text/plain", []byte("\x00\x01\x02binário"), "application/octet-stream"},
	}
	for _, tc := range cases {
		got := env.uploadKind(t, tc.filename, tc.declared, tc.data)
		if got.Kind != "file" || got.ContentType != tc.wantType || got.Filename != tc.filename {
			t.Errorf("%s: resposta = %+v", tc.filename, got)
		}
	}
}

func TestUploadRefusesWhenDiskLow(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: false})
	rec := env.upload(t, "/api/channels/c1/attachments", nil, "foto.png", "image/png", pngBytes(108))
	if rec.Code != http.StatusInsufficientStorage || !strings.Contains(rec.Body.String(), "server out of space") {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	env.assertDiskEmpty(t)
}

func TestUploadRequiresWriteAccess(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{ErrNoRoomAccess, http.StatusForbidden},
		{ErrRoomNotFound, http.StatusNotFound},
	}
	for _, tc := range cases {
		env := newAttachmentEnv(t, fakeAccess{writeErr: tc.err}, fakeSpace{ok: true})
		rec := env.upload(t, "/api/channels/c1/attachments", nil, "foto.png", "image/png", pngBytes(108))
		if rec.Code != tc.want {
			t.Fatalf("%v: status = %d, want %d", tc.err, rec.Code, tc.want)
		}
		if len(env.repo.rows) != 0 {
			t.Fatal("não deveria gravar linha")
		}
		env.assertDiskEmpty(t)
	}
}

func TestUploadKeepsCleanFilename(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	data := append([]byte("OggS\x00\x02"), make([]byte, 64)...)
	rec := env.upload(t, "/api/channels/c1/attachments", nil, `..\..\x\voz.ogg`, "audio/ogg", data)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got Attachment
	json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Filename != "voz.ogg" || got.Kind != "audio" {
		t.Fatalf("resposta = %+v", got)
	}
}

// storedImage deixa no repo e no disco uma imagem do canal c1 (ligada a
// messageID, ou pendente se nil).
func (e *attachmentEnv) storedImage(t *testing.T, messageID *string) (string, []byte) {
	t.Helper()
	id := "5f0c7c43-6c1a-4f53-9d43-2c9f3b6a0a11"
	data := pngBytes(64)
	if _, _, err := e.store.Save(id, bytes.NewReader(data), 1024); err != nil {
		t.Fatal(err)
	}
	channelID := "c1"
	e.repo.rows[id] = &storedAttachment{
		Attachment: Attachment{ID: id, Kind: "image", ContentType: "image/png", Filename: "foto.png", SizeBytes: int64(len(data))},
		UploaderID: "u1",
		MessageID:  messageID,
		ChannelID:  &channelID,
		CreatedAt:  time.Now().Add(-time.Minute),
	}
	return id, data
}

func (e *attachmentEnv) get(path string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func TestServeFileStreamsStoredType(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	messageID := "m1"
	id, data := env.storedImage(t, &messageID)
	rec := env.get("/api/media/"+id+"?token=bom", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", got)
	}
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Fatal("corpo diferente do arquivo salvo")
	}
}

// O app web serve a mídia na mesma origem dos tokens: o arquivo aberto
// direto não pode rodar script nem carregar nada.
func TestServeFileSandboxesContent(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	messageID := "m1"
	id, _ := env.storedImage(t, &messageID)
	rec := env.get("/api/media/"+id+"?token=bom", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Security-Policy"); got != "default-src 'none'; sandbox" {
		t.Fatalf("Content-Security-Policy = %q", got)
	}
}

// Arquivo genérico sempre baixa (o navegador não abre HTML/PDF na origem do
// app); imagem, vídeo e áudio continuam inline.
func TestServeFileDispositionByKind(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	messageID := "m1"
	id, _ := env.storedImage(t, &messageID)
	rec := env.get("/api/media/"+id+"?token=bom", nil)
	if got := rec.Header().Get("Content-Disposition"); got != `inline; filename=foto.png` {
		t.Fatalf("imagem: Content-Disposition = %q", got)
	}
	row := env.repo.rows[id]
	row.Kind, row.ContentType, row.Filename = "file", "text/plain; charset=utf-8", "pagina.html"
	rec = env.get("/api/media/"+id+"?token=bom", nil)
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename=pagina.html` {
		t.Fatalf("arquivo: Content-Disposition = %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", got)
	}
}

func TestServeFileSupportsRange(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	messageID := "m1"
	id, data := env.storedImage(t, &messageID)
	rec := env.get("/api/media/"+id+"?token=bom", map[string]string{"Range": "bytes=0-3"})
	if rec.Code != http.StatusPartialContent || !bytes.Equal(rec.Body.Bytes(), data[:4]) {
		t.Fatalf("status = %d, corpo = %q", rec.Code, rec.Body.Bytes())
	}
}

func TestServeFileRequiresValidToken(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	messageID := "m1"
	id, _ := env.storedImage(t, &messageID)
	for _, path := range []string{"/api/media/" + id, "/api/media/" + id + "?token=ruim"} {
		if rec := env.get(path, nil); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s: status = %d, want 401", path, rec.Code)
		}
	}
}

func TestServeFileHidesFromOutsiders(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{readErr: ErrNoRoomAccess}, fakeSpace{ok: true})
	messageID := "m1"
	id, _ := env.storedImage(t, &messageID)
	if rec := env.get("/api/media/"+id+"?token=bom", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestServeFileHidesPending(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	id, _ := env.storedImage(t, nil)
	if rec := env.get("/api/media/"+id+"?token=bom", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestMediaTokenEndpoint(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	rec := env.get("/api/media/token", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Token == "" || body.ExpiresAt == "" {
		t.Fatalf("corpo = %s (%v)", rec.Body.String(), err)
	}
}

func TestSaveErrorStatus(t *testing.T) {
	cases := []struct {
		err    error
		status int
		msg    string
	}{
		{media.ErrTooLarge, http.StatusRequestEntityTooLarge, "file too large"},
		{&http.MaxBytesError{Limit: 1}, http.StatusRequestEntityTooLarge, "file too large"},
		// Disco encheu no meio (outro upload ao mesmo tempo): mesmo erro do HasRoom.
		{&os.PathError{Op: "write", Path: "x", Err: syscall.ENOSPC}, http.StatusInsufficientStorage, "server out of space"},
		{io.ErrUnexpectedEOF, http.StatusBadRequest, "invalid upload"},
	}
	for _, tc := range cases {
		status, msg := saveErrorStatus(tc.err)
		if status != tc.status || msg != tc.msg {
			t.Fatalf("saveErrorStatus(%v) = (%d, %q), want (%d, %q)", tc.err, status, msg, tc.status, tc.msg)
		}
	}
}

// Arquivo vazio não vira anexo (o banco exige size_bytes >= 1): 400, nada no disco.
func TestUploadRejectsEmptyFile(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	rec := env.upload(t, "/api/channels/c1/attachments", nil, "vazio.txt", "text/plain", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	env.assertDiskEmpty(t)
	if len(env.repo.rows) != 0 {
		t.Fatal("não deveria gravar linha")
	}
}
