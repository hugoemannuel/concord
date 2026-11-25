package recovery

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"

	"github.com/gin-gonic/gin"
)

// resetObservers limpa o registro global entre os testes.
func resetObservers(t *testing.T) {
	t.Helper()
	t.Cleanup(func() { observers.Store(nil) })
	observers.Store(nil)
}

func panicRouter(value any) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("userID", "u-1") }, Middleware())
	r.GET("/servers/:id", func(*gin.Context) { panic(value) })
	return r
}

func get(r *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func silenceGinLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	old := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &buf
	t.Cleanup(func() { gin.DefaultErrorWriter = old })
	return &buf
}

func TestMiddlewareResponde500EAvisaOsObservadores(t *testing.T) {
	resetObservers(t)
	logs := silenceGinLog(t)
	var got []Panic
	Observe(func(p Panic) { got = append(got, p) })

	w := get(panicRouter("deu ruim"), "/servers/42")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, quer 500", w.Code)
	}
	if len(got) != 1 {
		t.Fatalf("observador chamado %d vezes, quer 1", len(got))
	}
	p := got[0]
	if p.Route != "/servers/:id" || p.Method != http.MethodGet || p.Value != "deu ruim" || p.UserID != "u-1" {
		t.Errorf("panic = %+v", p)
	}
	if !bytes.Contains(p.Stack, []byte("recovery_test.go")) {
		t.Errorf("pilha sem o quadro do handler:\n%s", p.Stack)
	}
	if !strings.Contains(logs.String(), "[Recovery]") || !strings.Contains(logs.String(), "deu ruim") {
		t.Errorf("log sem o panic: %q", logs.String())
	}
}

func TestMiddlewareObservadorQueDaPanicNaoDerrubaAResposta(t *testing.T) {
	resetObservers(t)
	silenceGinLog(t)
	var second bool
	Observe(func(Panic) { panic("observador quebrado") })
	Observe(func(Panic) { second = true })

	w := get(panicRouter(errors.New("falhou")), "/servers/1")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, quer 500", w.Code)
	}
	if !second {
		t.Error("o segundo observador não foi chamado")
	}
}

func TestMiddlewareConexaoCaidaNaoAvisaNemEscreve500(t *testing.T) {
	resetObservers(t)
	silenceGinLog(t)
	var called bool
	Observe(func(Panic) { called = true })

	w := get(panicRouter(syscall.EPIPE), "/servers/1")

	if called {
		t.Error("broken pipe não é bug: o observador não deve ser chamado")
	}
	if w.Code == http.StatusInternalServerError && w.Body.Len() > 0 {
		t.Errorf("broken pipe escreveu resposta: %d %q", w.Code, w.Body.String())
	}
}

func TestMiddlewareSemPanicSegueNormal(t *testing.T) {
	resetObservers(t)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware())
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	if w := get(r, "/ok"); w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, quer 204", w.Code)
	}
}

func TestMiddlewareRotaDesconhecidaVemVazia(t *testing.T) {
	resetObservers(t)
	silenceGinLog(t)
	var got Panic
	Observe(func(p Panic) { got = p })
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware(), func(*gin.Context) { panic(42) })

	get(r, "/nada")

	if got.Route != "" || got.Value != "42" || got.UserID != "" {
		t.Errorf("panic = %+v", got)
	}
}
