package memberprofile

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

const serverUUID = "11111111-1111-4111-8111-111111111111"

// fakeImages finge o upload: entrega a URL ao apply, como o ProfileHandler.
type fakeImages struct {
	fakeMedia
	uploads int
}

func (f *fakeImages) UploadImage(c *gin.Context, apply user.ImageApply) {
	f.uploads++
	url := "/api/profile-media/novo"
	old, ok := apply(c.Request.Context(), c.GetString("userID"), &url)
	if ok {
		f.RemoveMediaURL(old)
	}
}

func newRouter(t *testing.T, loggedAs string) (*gin.Engine, *fakeImages, *fakeStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	snap := permission.NewSnapshot(serverUUID, "dono", permission.DefaultEveryone).WithMember("ana")
	st := &fakeStore{rows: map[string]Overrides{}}
	images := &fakeImages{}
	svc := NewService(st, fakeSnapshots{snap}, &fakePublisher{}, images)
	r := gin.New()
	auth := func(c *gin.Context) {
		if loggedAs != "" {
			c.Set("userID", loggedAs)
		}
		c.Next()
	}
	Routes(r.Group("/api"), NewHandler(svc, images), auth)
	return r, images, st
}

func do(r http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHandlerStatus(t *testing.T) {
	base := "/api/servers/" + serverUUID + "/my-profile"
	cases := []struct {
		name, as, method, path, body string
		want                         int
	}{
		{"sem login", "", http.MethodGet, base, "", http.StatusUnauthorized},
		{"id ruim", "ana", http.MethodGet, "/api/servers/nao-e-uuid/my-profile", "", http.StatusForbidden},
		{"não membro lê", "ze", http.MethodGet, base, "", http.StatusForbidden},
		{"não membro edita", "ze", http.MethodPatch, base, `{"bio":"x"}`, http.StatusForbidden},
		{"não membro apaga", "ze", http.MethodDelete, base, "", http.StatusForbidden},
		{"não membro envia", "ze", http.MethodPost, base + "/avatar", "", http.StatusForbidden},
		{"não membro reseta", "ze", http.MethodDelete, base + "/avatar", "", http.StatusForbidden},
		{"json ruim", "ana", http.MethodPatch, base, `{`, http.StatusBadRequest},
		{"inválido", "ana", http.MethodPatch, base, `{"banner_color":"azul"}`, http.StatusBadRequest},
		{"lê", "ana", http.MethodGet, base, "", http.StatusOK},
		{"edita", "ana", http.MethodPatch, base, `{"bio":"x"}`, http.StatusOK},
		{"apaga", "ana", http.MethodDelete, base, "", http.StatusOK},
		{"envia", "ana", http.MethodPost, base + "/banner", "", http.StatusOK},
		{"reseta", "ana", http.MethodDelete, base + "/banner", "", http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, _, _ := newRouter(t, tc.as)
			if w := do(r, tc.method, tc.path, tc.body); w.Code != tc.want {
				t.Fatalf("esperava %d, veio %d: %s", tc.want, w.Code, w.Body)
			}
		})
	}
}

// Não membro não gasta disco: o upload nem começa.
func TestUploadNaoComecaParaQuemNaoEMembro(t *testing.T) {
	r, images, _ := newRouter(t, "ze")
	do(r, http.MethodPost, "/api/servers/"+serverUUID+"/my-profile/avatar", "")
	if images.uploads != 0 {
		t.Fatal("upload começou")
	}
}

func TestUploadTrocaEApagaAAntiga(t *testing.T) {
	r, images, st := newRouter(t, "ana")
	old := "/api/profile-media/velho"
	st.rows[key(serverUUID, "ana")] = Overrides{AvatarURL: &old}
	w := do(r, http.MethodPost, "/api/servers/"+serverUUID+"/my-profile/avatar", "")
	if w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	var view View
	if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if *view.Profile.AvatarURL != "/api/profile-media/novo" {
		t.Fatalf("%s", w.Body)
	}
	if len(images.removed) != 1 || images.removed[0] != old {
		t.Fatalf("antiga: %v", images.removed)
	}
}

func TestResetApagaArquivoDaImagem(t *testing.T) {
	r, images, st := newRouter(t, "ana")
	old := "/api/profile-media/deco"
	st.rows[key(serverUUID, "ana")] = Overrides{AvatarDecorationURL: &old}
	if w := do(r, http.MethodDelete, "/api/servers/"+serverUUID+"/my-profile/decoration", ""); w.Code != http.StatusOK {
		t.Fatalf("%d", w.Code)
	}
	if len(images.removed) != 1 || images.removed[0] != old {
		t.Fatalf("%v", images.removed)
	}
}

func TestRunMediaSweepEsvaziaEPara(t *testing.T) {
	st := &fakeStore{rows: map[string]Overrides{}, trash: []string{"/api/profile-media/x"}}
	media := &fakeMedia{}
	svc := NewService(st, fakeSnapshots{}, nil, media)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	svc.RunMediaSweep(ctx, SweepInterval)
	if len(media.removed) != 1 {
		t.Fatalf("%v", media.removed)
	}
}
