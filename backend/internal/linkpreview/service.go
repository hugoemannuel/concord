package linkpreview

import (
	"context"
	"io"
	"log"
	"sync"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/google/uuid"
)

const (
	// cacheTTL: quanto uma prévia (ou falha) guardada vale.
	cacheTTL = 24 * time.Hour
	// maxImageBytes: imagem maior que isso fica de fora (cartão sem imagem).
	maxImageBytes int64 = 5 << 20
	// buildTimeout: a busca inteira (página + imagem), que não depende de quem pediu.
	buildTimeout = 15 * time.Second
)

// entryStore é o cache (link_previews).
type entryStore interface {
	Find(ctx context.Context, url string) (Entry, bool, error)
	Save(ctx context.Context, e Entry) error
}

// fetcher busca na internet (o SafeClient).
type fetcher interface {
	FetchHTML(ctx context.Context, raw string) (Page, error)
	Open(ctx context.Context, raw string) (io.ReadCloser, error)
}

// imageFiles guarda as imagens baixadas (media.Store numa pasta própria).
type imageFiles interface {
	Save(id string, r io.Reader, limit int64) (int64, []byte, error)
	Remove(name string) error
}

// diskRoom diz se ainda cabe arquivo no disco (media.Space).
type diskRoom interface {
	HasRoom(incoming int64) bool
}

// Service: cache por URL + busca. Pedidos simultâneos da mesma URL viram uma
// busca só (inflight); quem chega depois espera o resultado.
type Service struct {
	store  entryStore
	client fetcher
	images imageFiles
	room   diskRoom
	now    func() time.Time

	mu       sync.Mutex
	inflight map[string]*flight
}

type flight struct {
	done    chan struct{}
	preview *Preview
}

func NewService(store entryStore, client fetcher, images imageFiles, room diskRoom) *Service {
	return &Service{store: store, client: client, images: images, room: room, now: time.Now, inflight: map[string]*flight{}}
}

// Cached devolve o que está guardado e ainda vale: hit=false manda buscar;
// hit=true com nil é falha guardada (sem cartão). key já normalizada.
func (s *Service) Cached(ctx context.Context, key string) (*Preview, bool, error) {
	e, ok, err := s.store.Find(ctx, key)
	if err != nil || !ok || s.now().Sub(e.FetchedAt) >= cacheTTL {
		return nil, false, err
	}
	return e.card(), true, nil
}

// Fetch busca a página, guarda e devolve o cartão (nil = sem cartão). A busca
// usa um contexto próprio: quem desiste (ctx) só para de esperar, e a busca
// termina e fica no cache para os outros.
func (s *Service) Fetch(ctx context.Context, key string) (*Preview, error) {
	f, leader := s.join(key)
	if leader {
		f.preview = s.fetchAndStore(key)
		s.leave(key, f)
	}
	select {
	case <-f.done:
		return f.preview, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// join entra na busca em andamento da URL, ou abre uma (leader=true).
func (s *Service) join(key string) (*flight, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if f, ok := s.inflight[key]; ok {
		return f, false
	}
	f := &flight{done: make(chan struct{})}
	s.inflight[key] = f
	return f, true
}

func (s *Service) leave(key string, f *flight) {
	s.mu.Lock()
	delete(s.inflight, key)
	s.mu.Unlock()
	close(f.done)
}

func (s *Service) fetchAndStore(key string) *Preview {
	ctx, cancel := context.WithTimeout(context.Background(), buildTimeout)
	defer cancel()
	entry := s.build(ctx, key)
	if err := s.store.Save(ctx, entry); err != nil {
		log.Printf("[linkpreview] guardar a prévia: %v", err)
	}
	return entry.card()
}

// build busca a página e monta a linha do cache (Failed quando não há cartão).
func (s *Service) build(ctx context.Context, key string) Entry {
	entry := Entry{Preview: Preview{URL: key}, FetchedAt: s.now()}
	page, err := s.client.FetchHTML(ctx, key)
	if err != nil {
		// A recusa do cliente blindado (IP interno, porta...) aparece aqui no log.
		log.Printf("[linkpreview] sem prévia: %v", err)
		entry.Failed = true
		return entry
	}
	parsed := Parse(page.Body, page.URL)
	if parsed.Empty() {
		entry.Failed = true
		return entry
	}
	entry.Preview = Preview{
		URL:         key,
		SiteName:    parsed.SiteName,
		Title:       parsed.Title,
		Description: parsed.Description,
		ImageID:     s.saveImage(ctx, parsed.ImageURL),
		Color:       parsed.Color,
		YouTubeID:   YouTubeID(key),
	}
	return entry
}

// saveImage baixa a imagem pelo mesmo cliente blindado e guarda só PNG, JPEG,
// GIF ou WebP (pelos bytes) de até 5 MB. Falhou: cartão sem imagem ("").
func (s *Service) saveImage(ctx context.Context, raw string) string {
	if raw == "" || !s.room.HasRoom(maxImageBytes) {
		return ""
	}
	body, err := s.client.Open(ctx, raw)
	if err != nil {
		return ""
	}
	defer body.Close()
	id := uuid.NewString()
	_, head, err := s.images.Save(id, body, maxImageBytes)
	if err != nil {
		return ""
	}
	if kind, _, ok := media.Sniff(head, ""); !ok || kind != media.KindImage {
		if err := s.images.Remove(id); err != nil {
			log.Printf("[linkpreview] apagar imagem recusada %s: %v", id, err)
		}
		return ""
	}
	return id
}
