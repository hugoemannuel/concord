package event

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"syscall"
	"testing"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

// Cabeçalhos mínimos de cada formato (o Sniff olha só o começo do arquivo).
var (
	pngHead  = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	jpegHead = append([]byte("\xff\xd8\xff\xe0\x00\x10JFIF"), make([]byte, 32)...)
	webpHead = append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 32)...)
	gifHead  = append([]byte("GIF89a"), make([]byte, 32)...)
)

func TestBannerTypeAcceptsStaticImagesOnly(t *testing.T) {
	cases := []struct {
		name string
		head []byte
		want string
		ok   bool
	}{
		{"png", pngHead, "image/png", true},
		{"jpeg", jpegHead, "image/jpeg", true},
		{"webp", webpHead, "image/webp", true},
		{"gif animado não vale", gifHead, "", false},
		{"texto não vale", []byte("<html>não sou imagem</html>"), "", false},
	}
	for _, c := range cases {
		got, ok := bannerType(media.Form{Head: c.head, Declared: "image/png"})
		if ok != c.ok || got != c.want {
			t.Errorf("%s: %q %v, esperava %q %v", c.name, got, ok, c.want, c.ok)
		}
	}
}

type fakeTokens struct{ user string }

func (f fakeTokens) VerifyMediaToken(token string) (string, error) {
	if token != "ok" {
		return "", errors.New("token inválido")
	}
	return f.user, nil
}

type fakeFinder map[string]string

func (f fakeFinder) ServerOfBanner(_ context.Context, bannerID string) (string, error) {
	server, ok := f[bannerID]
	if !ok {
		return "", ErrEventNotFound
	}
	return server, nil
}

type fakeSpace bool

func (f fakeSpace) HasRoom(int64) bool { return bool(f) }

func bannerRouter(t *testing.T, userID string, finder fakeFinder, room bool) (*gin.Engine, *media.Store) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	access := newFakeAccess()
	access.actions["mod"] = ActionEdit // para o banner basta poder criar ou editar
	members := fakeMembers{"mod": true, "membro": true}
	b := NewBannerHandler(store, fakeSpace(room), access, members, fakeTokens{user: userID}, finder)
	r := gin.New()
	auth := func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	}
	Routes(r.Group("/api"), NewHandler(&fakeService{}), b, auth)
	return r, store
}

func uploadBody(t *testing.T, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="file"; filename="banner.png"`)
	h.Set("Content-Type", "image/png")
	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(content)
	_ = w.Close()
	return body, w.FormDataContentType()
}

func postBanner(r *gin.Engine, body *bytes.Buffer, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/servers/s1/events/banner", body)
	req.Header.Set("Content-Type", contentType)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestUploadBannerNeedsToBeAbleToCreateOrEdit(t *testing.T) {
	r, _ := bannerRouter(t, "membro", fakeFinder{}, true)
	body, ct := uploadBody(t, pngHead)
	w := postBanner(r, body, ct)
	if w.Code != http.StatusForbidden || errCode(t, w) != "missing_permission" {
		t.Fatalf("status = %d, corpo %s", w.Code, w.Body.String())
	}
}

func TestUploadBannerSavesTheFileAndReturnsItsID(t *testing.T) {
	r, store := bannerRouter(t, "mod", fakeFinder{}, true)
	body, ct := uploadBody(t, pngHead)
	w := postBanner(r, body, ct)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, corpo %s", w.Code, w.Body.String())
	}
	var resp struct {
		BannerID string `json:"banner_id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	file, err := store.Open(resp.BannerID)
	if err != nil {
		t.Fatalf("o arquivo %q não foi salvo: %v", resp.BannerID, err)
	}
	file.Close()
}

func TestUploadBannerRejectsNonImageAndLeavesNoFile(t *testing.T) {
	r, store := bannerRouter(t, "mod", fakeFinder{}, true)
	body, ct := uploadBody(t, []byte("isto não é uma imagem, é só texto"))
	w := postBanner(r, body, ct)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, corpo %s", w.Code, w.Body.String())
	}
	if files, _ := store.List(); len(files) != 0 {
		t.Errorf("sobrou arquivo depois da recusa: %+v", files)
	}
}

func TestUploadBannerWithoutDiskRoomIs507(t *testing.T) {
	r, _ := bannerRouter(t, "mod", fakeFinder{}, false)
	body, ct := uploadBody(t, pngHead)
	if w := postBanner(r, body, ct); w.Code != http.StatusInsufficientStorage {
		t.Fatalf("status = %d", w.Code)
	}
}

func serveBanner(r *gin.Engine, id, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/event-banners/"+id+"?token="+token, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestServeBanner(t *testing.T) {
	const id = "11111111-1111-4111-8111-111111111111"
	r, store := bannerRouter(t, "membro", fakeFinder{id: "s1"}, true)
	if _, _, err := store.Save(id, bytes.NewReader(pngHead), 1<<20); err != nil {
		t.Fatal(err)
	}
	if w := serveBanner(r, id, "errado"); w.Code != http.StatusUnauthorized {
		t.Errorf("token inválido = %d", w.Code)
	}
	if w := serveBanner(r, "22222222-2222-4222-8222-222222222222", "ok"); w.Code != http.StatusNotFound {
		t.Errorf("banner sem evento = %d", w.Code)
	}
	w := serveBanner(r, id, "ok")
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("membro = %d tipo %q", w.Code, w.Header().Get("Content-Type"))
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("falta o nosniff")
	}
}

func TestServeBannerHidesItFromOtherServers(t *testing.T) {
	const id = "11111111-1111-4111-8111-111111111111"
	r, store := bannerRouter(t, "estranho", fakeFinder{id: "s1"}, true)
	_, _, _ = store.Save(id, bytes.NewReader(pngHead), 1<<20)
	if w := serveBanner(r, id, "ok"); w.Code != http.StatusNotFound {
		t.Fatalf("quem não é membro = %d, esperava 404", w.Code)
	}
}

func TestFormErrorStatusByCause(t *testing.T) {
	cases := []struct {
		err    error
		status int
	}{
		{media.ErrMissingFile, http.StatusBadRequest},
		{media.ErrBadForm, http.StatusBadRequest},
		{media.ErrTooLarge, http.StatusRequestEntityTooLarge},
		{syscall.ENOSPC, http.StatusInsufficientStorage},
		{errors.New("disco quebrou"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		if got := formError(c.err); got.status != c.status {
			t.Errorf("%v → %d, esperava %d", c.err, got.status, c.status)
		}
	}
}
