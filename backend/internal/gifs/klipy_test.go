package gifs

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

const testKey = "chave-secreta-da-klipy"

// klipyBody é o formato real da doc (GET api/v1/{app_key}/gifs/search), já com
// format_filter=gif: result + data.data[] com file.{hd,md,sm,xs}.gif.
const klipyBody = `{
  "result": true,
  "data": {
    "data": [
      {
        "id": 8041071659142944,
        "slug": "hello-hi-662",
        "title": "Hello",
        "file": {
          "hd": {"gif": {"url": "https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/hd.gif", "width": 498, "height": 498, "size": 4001918}},
          "md": {"gif": {"url": "https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/md.gif", "width": 400, "height": 300, "size": 3721260}},
          "sm": {"gif": {"url": "https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/sm.gif", "width": 220, "height": 165, "size": 314884}},
          "xs": {"gif": {"url": "https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/xs.gif", "width": 90, "height": 68, "size": 71468}}
        },
        "tags": ["hello"],
        "type": "gif",
        "blur_preview": "data:image/jpeg;base64,AAAA"
      }
    ],
    "current_page": 1,
    "per_page": 24,
    "has_next": true
  }
}`

// fakeKlipy sobe um servidor que imita a API e devolve o cliente apontado para ele.
func fakeKlipy(t *testing.T, handler http.HandlerFunc) (*KlipyClient, *httptest.Server) {
	t.Helper()
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)
	c := NewKlipyClient(testKey)
	c.baseURL = ts.URL
	return c, ts
}

func TestKlipyBuscaUsaRotaEParametrosDaDoc(t *testing.T) {
	t.Parallel()
	var got *http.Request
	c, _ := fakeKlipy(t, func(w http.ResponseWriter, r *http.Request) {
		got = r
		w.Write([]byte(klipyBody))
	})
	items, err := c.Search(context.Background(), "gato fofo", 25, 25, "cust-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.URL.Path != "/api/v1/"+testKey+"/gifs/search" {
		t.Fatalf("rota = %s", got.URL.Path)
	}
	q := got.URL.Query()
	quer := map[string]string{"q": "gato fofo", "page": "2", "per_page": "25", "customer_id": "cust-1", "locale": "br", "content_filter": "high", "format_filter": "gif"}
	for k, v := range quer {
		if q.Get(k) != v {
			t.Errorf("param %s = %q, quer %q", k, q.Get(k), v)
		}
	}
	if len(items) != 1 {
		t.Fatalf("itens = %+v", items)
	}
	it := items[0]
	if it.ID != "935d7ab9d8c6202580a668421940ec81" || it.Provider != ProviderKlipy || it.Title != "Hello" {
		t.Fatalf("item = %+v", it)
	}
	if !strings.HasSuffix(it.URL, "/md.gif") || !strings.HasSuffix(it.PreviewURL, "/sm.gif") || it.Width != 400 || it.Height != 300 {
		t.Fatalf("mídia = %+v", it)
	}
}

func TestKlipyEmAltaUsaRotaTrending(t *testing.T) {
	t.Parallel()
	var path, query string
	c, _ := fakeKlipy(t, func(w http.ResponseWriter, r *http.Request) {
		path, query = r.URL.Path, r.URL.RawQuery
		w.Write([]byte(klipyBody))
	})
	if _, err := c.Trending(context.Background(), 25, 0, "cust-1"); err != nil {
		t.Fatal(err)
	}
	if path != "/api/v1/"+testKey+"/gifs/trending" || strings.Contains(query, "q=") || !strings.Contains(query, "page=1") {
		t.Fatalf("rota/consulta = %s ? %s", path, query)
	}
}

func TestKlipyLimiteEPaginaRespeitamOsLimitesDaApi(t *testing.T) {
	t.Parallel()
	casos := []struct {
		limit, offset int
		perPage, page string
	}{
		{0, 0, "25", "1"},
		{3, 0, "8", "1"},
		{500, 0, "50", "1"},
		{20, 40, "20", "3"},
		{20, -5, "20", "1"},
	}
	for _, tc := range casos {
		var q map[string][]string
		c, _ := fakeKlipy(t, func(w http.ResponseWriter, r *http.Request) {
			q = r.URL.Query()
			w.Write([]byte(klipyBody))
		})
		if _, err := c.Trending(context.Background(), tc.limit, tc.offset, ""); err != nil {
			t.Fatal(err)
		}
		if q["per_page"][0] != tc.perPage || q["page"][0] != tc.page {
			t.Errorf("limit=%d offset=%d: per_page=%v page=%v, quer %s/%s", tc.limit, tc.offset, q["per_page"], q["page"], tc.perPage, tc.page)
		}
		if _, ok := q["customer_id"]; ok {
			t.Error("customer_id vazio não deve ir na consulta")
		}
	}
}

func TestKlipyIdCaiNoSlugSeAUrlNaoTiverOHash(t *testing.T) {
	t.Parallel()
	body := strings.ReplaceAll(klipyBody, "/ii/935d7ab9d8c6202580a668421940ec81/14/af/", "/x/")
	c, _ := fakeKlipy(t, func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(body)) })
	items, err := c.Trending(context.Background(), 25, 0, "")
	if err != nil || len(items) != 1 || items[0].ID != "hello-hi-662" {
		t.Fatalf("itens = %+v, err = %v", items, err)
	}
}

func TestKlipyIgnoraItensSemGifDeUrlDaKlipy(t *testing.T) {
	t.Parallel()
	body := `{"result":true,"data":{"data":[
		{"slug":"sem-gif","file":{"md":{"webp":{"url":"https://static.klipy.com/ii/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/b/x.webp"}}}},
		{"slug":"host-estranho","file":{"md":{"gif":{"url":"https://evil.com/ii/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/b/x.gif","width":1,"height":1}}}}
	]}}`
	c, _ := fakeKlipy(t, func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(body)) })
	items, err := c.Trending(context.Background(), 25, 0, "")
	if err != nil || len(items) != 0 {
		t.Fatalf("itens = %+v, err = %v", items, err)
	}
}

func TestKlipyFalhasViramIndisponivelESemChaveNoLog(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })

	casos := map[string]http.HandlerFunc{
		"status 500":    func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) },
		"status 401":    func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) },
		"json quebrado": func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("{")) },
		"result false":  func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(`{"result":false}`)) },
	}
	for nome, h := range casos {
		c, _ := fakeKlipy(t, h)
		if _, err := c.Search(context.Background(), "gato", 25, 0, ""); !errors.Is(err, ErrUnavailable) {
			t.Errorf("%s: err = %v, quer ErrUnavailable", nome, err)
		}
	}

	// Erro de rede: o *url.Error do Go carrega a URL (e a chave vai no caminho).
	c, ts := fakeKlipy(t, func(http.ResponseWriter, *http.Request) {})
	ts.Close()
	_, err := c.Search(context.Background(), "gato", 25, 0, "")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("erro de rede: err = %v", err)
	}
	if strings.Contains(buf.String(), testKey) || strings.Contains(err.Error(), testKey) {
		t.Fatalf("a chave apareceu no log ou no erro:\nlog: %s\nerr: %v", buf.String(), err)
	}
	if buf.Len() == 0 {
		t.Fatal("a falha deveria ter sido registrada no log (sem a chave)")
	}
}
