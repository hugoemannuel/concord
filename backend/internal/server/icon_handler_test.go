package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// PNG e GIF de 1x1 pixel.
const (
	tinyPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
	tinyGIF = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)

type fakeIconPerms struct{ allowed map[string]bool }

func (f fakeIconPerms) Require(_ context.Context, _, userID string, want int64) error {
	if want != permission.ManageServer {
		return errors.New("permissão errada")
	}
	if !f.allowed[userID] {
		return permission.ErrMissingPermission
	}
	return nil
}

type fakeIcons struct {
	icon   string
	events int
}

func (f *fakeIcons) SetIcon(_ context.Context, id string, url *string, _ string) (*Server, *string, error) {
	old := f.icon
	f.icon = ""
	if url != nil {
		f.icon = *url
	}
	f.events++ // o service real publica server:update aqui
	return &Server{ID: id, IconURL: f.icon}, &old, nil
}

type roomy struct{}

func (roomy) HasRoom(int64) bool { return true }

func iconSetup(t *testing.T) (*gin.Engine, *fakeIcons, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := media.NewStore(filepath.Join(dir, "profile"))
	if err != nil {
		t.Fatal(err)
	}
	static, err := media.NewStore(filepath.Join(dir, "profile", "static"))
	if err != nil {
		t.Fatal(err)
	}
	icons := &fakeIcons{}
	h := &Handler{
		perms:  fakeIconPerms{allowed: map[string]bool{"dono": true}},
		icons:  icons,
		images: user.NewProfileHandler(nil, store, static, roomy{}),
	}
	router := gin.New()
	auth := func(c *gin.Context) {
		if u := c.GetHeader("X-User"); u != "" {
			c.Set("userID", u)
		}
		c.Next()
	}
	next := func(c *gin.Context) { c.Next() }
	ServerRoutes(router.Group("/api"), h, auth, next, next)
	return router, icons, filepath.Join(dir, "profile")
}

func uploadIcon(t *testing.T, router *gin.Engine, actor string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, _ := mw.CreateFormFile("file", "icon")
	part.Write(data)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/servers/s1/icon", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if actor != "" {
		req.Header.Set("X-User", actor)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func mediaFiles(t *testing.T, dir string) int {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range entries {
		if !e.IsDir() {
			n++
		}
	}
	return n
}

func decode(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestUploadIconPermissions(t *testing.T) {
	router, icons, dir := iconSetup(t)
	png := decode(t, tinyPNG)

	if w := uploadIcon(t, router, "", png); w.Code != http.StatusUnauthorized {
		t.Errorf("sem login = %d", w.Code)
	}
	if w := uploadIcon(t, router, "ana", png); w.Code != http.StatusForbidden {
		t.Errorf("sem permissão = %d (%s)", w.Code, w.Body.String())
	}
	if icons.events != 0 || mediaFiles(t, dir) != 0 {
		t.Fatalf("sem permissão não pode gravar nada (eventos=%d)", icons.events)
	}
}

func TestUploadIconPNGAndGIF(t *testing.T) {
	router, icons, dir := iconSetup(t)

	if w := uploadIcon(t, router, "dono", decode(t, tinyPNG)); w.Code != http.StatusOK {
		t.Fatalf("png = %d (%s)", w.Code, w.Body.String())
	}
	if !strings.HasPrefix(icons.icon, "/api/profile-media/") || strings.Contains(icons.icon, "/a_") {
		t.Fatalf("icon png = %q", icons.icon)
	}
	pngIcon := icons.icon

	// GIF substitui o PNG: URL com a_ e o arquivo antigo é apagado.
	if w := uploadIcon(t, router, "dono", decode(t, tinyGIF)); w.Code != http.StatusOK {
		t.Fatalf("gif = %d (%s)", w.Code, w.Body.String())
	}
	if !strings.HasPrefix(icons.icon, "/api/profile-media/a_") {
		t.Fatalf("icon gif = %q", icons.icon)
	}
	if icons.icon == pngIcon || mediaFiles(t, dir) != 1 {
		t.Fatalf("o arquivo antigo devia ter sido apagado (arquivos=%d)", mediaFiles(t, dir))
	}
	if icons.events != 2 {
		t.Fatalf("eventos = %d", icons.events)
	}
}

func TestUploadIconRejectsNonImage(t *testing.T) {
	router, icons, dir := iconSetup(t)
	w := uploadIcon(t, router, "dono", []byte("<html><script>alert(1)</script></html>"))
	if w.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d", w.Code)
	}
	if icons.events != 0 || mediaFiles(t, dir) != 0 {
		t.Fatal("arquivo recusado não pode ficar no disco")
	}
}

func TestDeleteIcon(t *testing.T) {
	router, icons, dir := iconSetup(t)
	uploadIcon(t, router, "dono", decode(t, tinyPNG))

	del := func(actor string) int {
		req := httptest.NewRequest(http.MethodDelete, "/api/servers/s1/icon", nil)
		if actor != "" {
			req.Header.Set("X-User", actor)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w.Code
	}
	if code := del("ana"); code != http.StatusForbidden {
		t.Fatalf("sem permissão = %d", code)
	}
	if code := del("dono"); code != http.StatusOK {
		t.Fatalf("dono = %d", code)
	}
	if icons.icon != "" || mediaFiles(t, dir) != 0 {
		t.Fatalf("icon=%q arquivos=%d", icons.icon, mediaFiles(t, dir))
	}
}
