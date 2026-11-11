package message

import (
	"context"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Imagem da resposta da enquete. Antes era a URL de fora que a pessoa colou,
// carregada direto por todo mundo que via a enquete: o site recebia o IP de
// cada um (pixel de rastreio). Agora o servidor baixa a imagem na criação,
// pelo cliente blindado contra SSRF da prévia de links, e serve a cópia de
// PollImagePath<uuid>. Não deu para baixar: a resposta sai sem imagem.

// PollImagePath: o começo da image_url guardada (o app soma a origem da API).
const PollImagePath = "/api/poll-images/"

const (
	// maxPollImageBytes: o mesmo limite das imagens da prévia de links.
	maxPollImageBytes int64 = 5 << 20
	// localizeTimeout: tempo máximo para baixar as imagens de uma enquete.
	localizeTimeout = 15 * time.Second
)

// imageFetcher busca a imagem de fora (linkpreview.SafeClient).
type imageFetcher interface {
	Open(ctx context.Context, raw string) (io.ReadCloser, error)
}

// pollImageFiles: a pasta das imagens de enquete (media.Store).
type pollImageFiles interface {
	media.ImageOpener
	Save(id string, r io.Reader, limit int64) (int64, []byte, error)
	Remove(name string) error
}

type PollImages struct {
	fetch imageFetcher
	files pollImageFiles
	room  spaceChecker
}

func NewPollImages(fetch imageFetcher, files pollImageFiles, room spaceChecker) *PollImages {
	return &PollImages{fetch: fetch, files: files, room: room}
}

// SetPollImages liga a cópia das imagens das enquetes (no boot).
func (s *Service) SetPollImages(p *PollImages) { s.pollImages = p }

// Localize devolve a entrada com cada imagem de fora trocada pela cópia no
// servidor (ou vazia, se não deu para baixar). O que a validação vai recusar
// (com emoji, sem https, longa demais) fica como veio, sem busca. nil: tira as
// imagens de fora sem buscar.
func (p *PollImages) Localize(ctx context.Context, in CreatePollInput) CreatePollInput {
	answers := append([]PollAnswerInput(nil), in.Answers...)
	in.Answers = answers
	ctx, cancel := context.WithTimeout(ctx, localizeTimeout)
	defer cancel()
	var wg sync.WaitGroup
	for i := range answers {
		if !needsDownload(answers[i]) {
			continue
		}
		wg.Add(1)
		go func(a *PollAnswerInput) {
			defer wg.Done()
			a.ImageURL = p.download(ctx, strings.TrimSpace(a.ImageURL))
		}(&answers[i])
	}
	wg.Wait()
	return in
}

// needsDownload: imagem https válida numa resposta sem emoji.
func needsDownload(a PollAnswerInput) bool {
	raw := strings.TrimSpace(a.ImageURL)
	return strings.TrimSpace(a.Emoji) == "" && strings.HasPrefix(raw, "https://") && len(raw) <= PollImageURLMaxLength
}

// download guarda a imagem e devolve a URL da cópia ("" se não deu).
func (p *PollImages) download(ctx context.Context, raw string) string {
	if p == nil || !p.room.HasRoom(maxPollImageBytes) {
		return ""
	}
	body, err := p.fetch.Open(ctx, raw)
	if err != nil {
		return ""
	}
	defer body.Close()
	id := uuid.NewString()
	_, head, err := p.files.Save(id, body, maxPollImageBytes)
	if err != nil {
		return ""
	}
	if kind, _, ok := media.Sniff(head, ""); !ok || kind != media.KindImage {
		if err := p.files.Remove(id); err != nil {
			log.Printf("[enquete] apagar imagem recusada %s: %v", id, err)
		}
		return ""
	}
	return PollImagePath + id
}

// validPollImage: só a cópia guardada no servidor (PollImagePath<uuid>).
func validPollImage(raw string) bool {
	id, ok := strings.CutPrefix(raw, PollImagePath)
	return ok && uuid.Validate(id) == nil
}

// pollImageIDs: os arquivos que as image_url guardadas usam.
func pollImageIDs(urls []string) map[string]bool {
	used := make(map[string]bool, len(urls))
	for _, raw := range urls {
		if validPollImage(raw) {
			used[strings.TrimPrefix(raw, PollImagePath)] = true
		}
	}
	return used
}

// PollImageRoutes: GET /poll-images/:id, sem login (um <img> não manda
// Authorization). Só entrega imagem já guardada: nunca busca nada, e o id é um
// UUID aleatório.
func PollImageRoutes(api *gin.RouterGroup, p *PollImages) {
	api.GET("/poll-images/:id", func(c *gin.Context) {
		if !media.ServeImage(c.Writer, c.Request, p.files, c.Param("id")) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		}
	})
}
