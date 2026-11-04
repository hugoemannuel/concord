package gifs

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func gifsRouter(h *Handler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Routes(r.Group("/"), h, func(c *gin.Context) {
		c.Set("userID", c.GetHeader("X-User"))
		c.Next()
	})
	return r
}

func getGifs(r *gin.Engine, path, user string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-User", user)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func handlerComKlipy(t *testing.T, proxy bool) (*Handler, *int) {
	t.Helper()
	calls := 0
	c, _ := fakeKlipy(t, func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Write([]byte(klipyBody))
	})
	return &Handler{service: &Service{client: c, appKey: testKey, proxy: proxy}}, &calls
}

func TestSemChaveTudoDa503(t *testing.T) {
	t.Parallel()
	r := gifsRouter(NewHandler(Config{}))
	for _, path := range []string{"/gifs/config", "/gifs/trending", "/gifs/search?q=gato"} {
		w := getGifs(r, path, "u1")
		if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "gifs_unavailable") {
			t.Errorf("%s: %d %s, quer 503 gifs_unavailable", path, w.Code, w.Body.String())
		}
	}
}

func TestConfigEntregaChaveECustomerIdSemOIdReal(t *testing.T) {
	t.Parallel()
	h, calls := handlerComKlipy(t, false)
	r := gifsRouter(h)
	a := getGifs(r, "/gifs/config", "usuario-1")
	if a.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", a.Code, a.Body.String())
	}
	body := a.Body.String()
	for _, quer := range []string{`"provider":"klipy"`, `"app_key":"` + testKey + `"`, `"locale":"br"`, `"content_filter":"high"`, `"format_filter":"gif"`} {
		if !strings.Contains(body, quer) {
			t.Errorf("config sem %s: %s", quer, body)
		}
	}
	if strings.Contains(body, "usuario-1") {
		t.Fatalf("o id real vazou na config: %s", body)
	}
	if again := getGifs(r, "/gifs/config", "usuario-1").Body.String(); again != body {
		t.Fatal("o customer_id deve ser estável para a mesma pessoa")
	}
	if other := getGifs(r, "/gifs/config", "usuario-2").Body.String(); other == body {
		t.Fatal("pessoas diferentes precisam de customer_id diferente")
	}
	if *calls != 0 {
		t.Fatal("a config não deve chamar a KLIPY")
	}
}

func TestRotasAntigasSoFuncionamComProxyAprovado(t *testing.T) {
	t.Parallel()
	h, calls := handlerComKlipy(t, false)
	r := gifsRouter(h)
	if w := getGifs(r, "/gifs/trending", "u1"); w.Code != http.StatusServiceUnavailable || *calls != 0 {
		t.Fatalf("proxy desligado: %d, chamadas=%d, quer 503 sem chamar a KLIPY", w.Code, *calls)
	}

	h, calls = handlerComKlipy(t, true)
	r = gifsRouter(h)
	w := getGifs(r, "/gifs/search?q=gato&limit=25&offset=0", "u1")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"id":"935d7ab9d8c6202580a668421940ec81"`) || *calls != 1 {
		t.Fatalf("proxy ligado: %d %s (chamadas=%d)", w.Code, w.Body.String(), *calls)
	}
	// Busca vazia cai em "em alta"; sem cache (a KLIPY proíbe cache próprio).
	getGifs(r, "/gifs/search?q=%20", "u1")
	getGifs(r, "/gifs/search?q=%20", "u1")
	if *calls != 3 {
		t.Fatalf("chamadas = %d, quer 3 (sem cache)", *calls)
	}
}

func TestFalhaDaKlipyNoProxyDa503(t *testing.T) {
	t.Parallel()
	c, ts := fakeKlipy(t, func(http.ResponseWriter, *http.Request) {})
	ts.Close()
	r := gifsRouter(&Handler{service: &Service{client: c, appKey: testKey, proxy: true}})
	w := getGifs(r, "/gifs/trending", "u1")
	if w.Code != http.StatusServiceUnavailable || strings.Contains(w.Body.String(), testKey) {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}
