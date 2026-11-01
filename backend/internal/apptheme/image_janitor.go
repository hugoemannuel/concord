package apptheme

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

const (
	imageJanitorEvery = time.Hour
	// imageGrace: imagem enviada há menos que isso ainda pode estar num editor aberto.
	imageGrace = 24 * time.Hour
)

type imageFiles interface {
	List() ([]media.FileInfo, error)
	Remove(name string) error
}

// imageRefs: os temas que usam alguma imagem (de todas as pessoas).
type imageRefs interface {
	ThemesWithImages(ctx context.Context) ([]Theme, error)
}

// ImageJanitor apaga as imagens de fundo que nenhum tema usa: enviadas e não
// salvas (editor cancelado), trocadas, de tema apagado ou de conta excluída.
type ImageJanitor struct {
	files imageFiles
	refs  imageRefs
	now   func() time.Time
}

func NewImageJanitor(files imageFiles, refs imageRefs) *ImageJanitor {
	return &ImageJanitor{files: files, refs: refs, now: time.Now}
}

// Run faz uma faxina na hora e repete a cada hora até o contexto acabar.
func (j *ImageJanitor) Run(ctx context.Context) {
	ticker := time.NewTicker(imageJanitorEvery)
	defer ticker.Stop()
	for {
		if removed, err := j.Sweep(ctx); err != nil {
			log.Printf("[apptheme] faxina das imagens: %v", err)
		} else if len(removed) > 0 {
			log.Printf("[apptheme] faxina das imagens: %d arquivo(s) sem uso apagado(s)", len(removed))
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Sweep apaga os arquivos sem tema, mais velhos que o prazo, e devolve os ids.
func (j *ImageJanitor) Sweep(ctx context.Context) ([]string, error) {
	themes, err := j.refs.ThemesWithImages(ctx)
	if err != nil {
		return nil, err
	}
	files, err := j.files.List()
	if err != nil {
		return nil, err
	}
	used := imageIDs(themes)
	var removed []string
	for _, f := range files {
		if f.Temp || used[f.ID] || j.now().Sub(f.ModTime) < imageGrace {
			continue
		}
		if err := j.files.Remove(f.ID); err != nil {
			log.Printf("[apptheme] apagar a imagem %s: %v", f.ID, err)
			continue
		}
		removed = append(removed, f.ID)
	}
	return removed, nil
}
