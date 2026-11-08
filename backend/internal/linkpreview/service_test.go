package linkpreview

import (
	"context"
	"errors"
	"io"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

type memStore struct {
	mu      sync.Mutex
	entries map[string]Entry
}

func newMemStore(entries ...Entry) *memStore {
	s := &memStore{entries: map[string]Entry{}}
	for _, e := range entries {
		s.entries[e.URL] = e
	}
	return s
}

func (s *memStore) Find(_ context.Context, u string) (Entry, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[u]
	return e, ok, nil
}

func (s *memStore) Save(_ context.Context, e Entry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[e.URL] = e
	return nil
}

// fakeWeb responde páginas e imagens por URL e conta as buscas de página.
type fakeWeb struct {
	pages   map[string]string
	images  map[string]string
	fetches atomic.Int32
	opens   atomic.Int32
	// release: se não nil, a busca da página espera ele fechar.
	release chan struct{}
}

func (w *fakeWeb) FetchHTML(_ context.Context, raw string) (Page, error) {
	w.fetches.Add(1)
	if w.release != nil {
		<-w.release
	}
	body, ok := w.pages[raw]
	if !ok {
		return Page{}, ErrBlocked
	}
	u, _ := url.Parse(raw)
	return Page{Body: []byte(body), URL: u}, nil
}

func (w *fakeWeb) Open(_ context.Context, raw string) (io.ReadCloser, error) {
	w.opens.Add(1)
	body, ok := w.images[raw]
	if !ok {
		return nil, ErrBadStatus
	}
	return io.NopCloser(strings.NewReader(body)), nil
}

type room bool

func (r room) HasRoom(int64) bool { return bool(r) }

var now = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

func newTestService(t *testing.T, store *memStore, web *fakeWeb, hasRoom bool) (*Service, *media.Store, string) {
	t.Helper()
	dir := t.TempDir()
	images, err := media.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	s := NewService(store, web, images, room(hasRoom))
	s.now = func() time.Time { return now }
	return s, images, dir
}

const pngBytes = "\x89PNG\r\n\x1a\n0000000000000000"

const buserHTML = `<meta property="og:title" content="Buser"><meta property="og:image" content="/capa.png"><meta name="theme-color" content="#E0218A">`

func TestCachedAcertaSemBuscar(t *testing.T) {
	store := newMemStore(Entry{Preview: Preview{URL: "https://a.com/", Title: "A"}, FetchedAt: now.Add(-23 * time.Hour)})
	web := &fakeWeb{}
	s, _, _ := newTestService(t, store, web, true)

	p, hit, err := s.Cached(context.Background(), "https://a.com/")
	if err != nil || !hit || p == nil || p.Title != "A" {
		t.Fatalf("Cached = %+v, %v, %v; want o cartão guardado", p, hit, err)
	}
	if web.fetches.Load() != 0 {
		t.Error("cache acertado não busca")
	}
}

func TestCachedVencidoNaoVale(t *testing.T) {
	store := newMemStore(Entry{Preview: Preview{URL: "https://a.com/", Title: "A"}, FetchedAt: now.Add(-25 * time.Hour)})
	s, _, _ := newTestService(t, store, &fakeWeb{}, true)

	if _, hit, _ := s.Cached(context.Background(), "https://a.com/"); hit {
		t.Fatal("linha de 25 h não vale (validade 24 h)")
	}
}

func TestFetchFalhaFicaGuardada(t *testing.T) {
	store := newMemStore()
	web := &fakeWeb{}
	s, _, _ := newTestService(t, store, web, true)
	ctx := context.Background()

	p, err := s.Fetch(ctx, "http://10.0.0.1/")
	if err != nil || p != nil {
		t.Fatalf("Fetch = %+v, %v; want sem cartão", p, err)
	}
	cached, hit, _ := s.Cached(ctx, "http://10.0.0.1/")
	if !hit || cached != nil {
		t.Fatalf("falha não ficou guardada: %+v, %v", cached, hit)
	}
}

func TestFetchPaginaSemTagsViraFalha(t *testing.T) {
	store := newMemStore()
	web := &fakeWeb{pages: map[string]string{"https://a.com/": "<p>oi</p>"}}
	s, _, _ := newTestService(t, store, web, true)

	if p, _ := s.Fetch(context.Background(), "https://a.com/"); p != nil {
		t.Fatalf("Fetch = %+v, want nil", p)
	}
	if !store.entries["https://a.com/"].Failed {
		t.Error("página sem tags tem que ficar guardada como falha")
	}
}

func TestFetchMontaCartaoComImagem(t *testing.T) {
	store := newMemStore()
	web := &fakeWeb{
		pages:  map[string]string{"https://www.buser.com.br/": buserHTML},
		images: map[string]string{"https://www.buser.com.br/capa.png": pngBytes},
	}
	s, images, _ := newTestService(t, store, web, true)

	p, err := s.Fetch(context.Background(), "https://www.buser.com.br/")
	if err != nil || p == nil {
		t.Fatalf("Fetch = %+v, %v", p, err)
	}
	if p.Title != "Buser" || p.Color != "#e0218a" || p.ImageID == "" || p.URL != "https://www.buser.com.br/" {
		t.Errorf("cartão = %+v", p)
	}
	f, err := images.Open(p.ImageID)
	if err != nil {
		t.Fatalf("imagem não foi guardada: %v", err)
	}
	f.Close()
	if store.entries["https://www.buser.com.br/"].ImageID != p.ImageID {
		t.Error("linha do cache sem a imagem")
	}
}

func TestFetchYouTube(t *testing.T) {
	u := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	web := &fakeWeb{pages: map[string]string{u: `<meta property="og:title" content="Vídeo">`}}
	s, _, _ := newTestService(t, newMemStore(), web, true)

	p, _ := s.Fetch(context.Background(), u)
	if p == nil || p.YouTubeID != "dQw4w9WgXcQ" {
		t.Fatalf("cartão = %+v, want youtube_id", p)
	}
}

func TestFetchImagemQueNaoEImagemEApagada(t *testing.T) {
	web := &fakeWeb{
		pages:  map[string]string{"https://a.com/": `<meta property="og:title" content="A"><meta property="og:image" content="https://a.com/x.png">`},
		images: map[string]string{"https://a.com/x.png": "<svg onload=alert(1)></svg>"},
	}
	s, _, dir := newTestService(t, newMemStore(), web, true)

	p, _ := s.Fetch(context.Background(), "https://a.com/")
	if p == nil || p.ImageID != "" {
		t.Fatalf("cartão = %+v, want sem imagem", p)
	}
	if files, _ := os.ReadDir(dir); len(files) != 0 {
		t.Errorf("sobrou %d arquivo(s) na pasta", len(files))
	}
}

func TestFetchSemEspacoNaoBaixaImagem(t *testing.T) {
	web := &fakeWeb{
		pages:  map[string]string{"https://www.buser.com.br/": buserHTML},
		images: map[string]string{"https://www.buser.com.br/capa.png": pngBytes},
	}
	s, _, _ := newTestService(t, newMemStore(), web, false)

	p, _ := s.Fetch(context.Background(), "https://www.buser.com.br/")
	if p == nil || p.ImageID != "" || web.opens.Load() != 0 {
		t.Fatalf("cartão = %+v, opens = %d; want sem imagem e sem baixar", p, web.opens.Load())
	}
}

func TestFetchSimultaneoBuscaUmaVez(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		web := &fakeWeb{pages: map[string]string{"https://a.com/": `<title>A</title>`}, release: make(chan struct{})}
		s, _, _ := newTestService(t, newMemStore(), web, true)

		var wg sync.WaitGroup
		results := make([]*Preview, 2)
		for i := range results {
			wg.Go(func() {
				p, err := s.Fetch(context.Background(), "https://a.com/")
				if err != nil {
					t.Error(err)
				}
				results[i] = p
			})
		}
		synctest.Wait() // as duas chamadas estão paradas: uma na busca, outra esperando
		close(web.release)
		wg.Wait()

		if n := web.fetches.Load(); n != 1 {
			t.Errorf("buscas = %d, want 1", n)
		}
		for i, p := range results {
			if p == nil || p.Title != "A" {
				t.Errorf("resultado %d = %+v", i, p)
			}
		}
	})
}

func TestFetchQuemDesisteNaoDerrubaABusca(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		web := &fakeWeb{pages: map[string]string{"https://a.com/": `<title>A</title>`}, release: make(chan struct{})}
		store := newMemStore()
		s, _, _ := newTestService(t, store, web, true)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			s.Fetch(context.Background(), "https://a.com/")
		}()
		synctest.Wait()
		go func() {
			if _, err := s.Fetch(ctx, "https://a.com/"); !errors.Is(err, context.Canceled) {
				t.Errorf("quem desistiu: err = %v, want context.Canceled", err)
			}
		}()
		synctest.Wait()
		cancel()
		synctest.Wait()
		close(web.release)
		<-done
		if store.entries["https://a.com/"].Title != "A" {
			t.Error("a busca tem que terminar e guardar mesmo com um leitor desistindo")
		}
	})
}
