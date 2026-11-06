package bot

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func avatarRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	AvatarRoutes(r.Group("/api"))
	return r
}

func get(r *gin.Engine, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// O avatar dos bots vem do servidor, como o de qualquer pessoa: o GIF do
// Maestro tem o "a_" e o quadro parado em /static.
func TestAvatarRoutesServeEmbeddedImages(t *testing.T) {
	r := avatarRouter()
	cases := []struct{ path, contentType string }{
		{MaestroAvatarURL, "image/gif"},
		{MaestroAvatarURL + "/static", "image/png"},
		{SalinhaBotAvatarURL, "image/png"},
		{SalinhaBotAvatarURL + "/static", "image/png"},
	}
	for _, c := range cases {
		rec := get(r, c.path)
		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != c.contentType {
			t.Errorf("%s: status = %d, type = %q", c.path, rec.Code, rec.Header().Get("Content-Type"))
		}
		if rec.Body.Len() == 0 || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s: corpo vazio ou sem nosniff", c.path)
		}
	}
}

func TestAvatarRoutesUnknownIsNotFound(t *testing.T) {
	r := avatarRouter()
	for _, path := range []string{"/api/bot-media/outro", "/api/bot-media/..%2Fbot.go", "/api/bot-media/outro/static"} {
		if rec := get(r, path); rec.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d", path, rec.Code)
		}
	}
}

func TestAvatarURLsFollowProfileMediaConvention(t *testing.T) {
	if !strings.HasPrefix(MaestroAvatarURL, "/api/bot-media/a_") {
		t.Errorf("GIF do Maestro precisa do prefixo a_: %q", MaestroAvatarURL)
	}
	if strings.Contains(SalinhaBotAvatarURL, "/a_") {
		t.Errorf("o Salinha Bot não anima: %q", SalinhaBotAvatarURL)
	}
}
