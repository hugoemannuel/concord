package serverprofile

import (
	"context"
	"log"
	"path"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

const (
	imageJanitorEvery = time.Hour
	// imageGrace: imagem enviada há menos que isso ainda pode estar num rascunho.
	imageGrace = 24 * time.Hour
)

type imageFiles interface {
	List() ([]media.FileInfo, error)
	Remove(name string) error
}

// imageRefs: as imagens que os perfis usam.
type imageRefs interface {
	ImagesInUse(ctx context.Context) ([]string, error)
}

// ImageJanitor apaga as imagens que nenhum perfil usa: enviadas e não salvas,
// trocadas ou de servidor apagado.
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
	runEvery(ctx, imageJanitorEvery, true, func() {
		if err := j.Sweep(ctx); err != nil {
			log.Printf("[serverprofile] faxina das imagens: %v", err)
		}
	})
}

// Sweep apaga os arquivos sem uso, mais velhos que o prazo.
func (j *ImageJanitor) Sweep(ctx context.Context) error {
	urls, err := j.refs.ImagesInUse(ctx)
	if err != nil {
		return err
	}
	files, err := j.files.List()
	if err != nil {
		return err
	}
	used := make(map[string]bool, len(urls))
	for _, url := range urls {
		used[path.Base(url)] = true
	}
	for _, f := range files {
		if f.Temp || used[f.ID] || j.now().Sub(f.ModTime) < imageGrace {
			continue
		}
		if err := j.files.Remove(f.ID); err != nil {
			log.Printf("[serverprofile] apagar a imagem %s: %v", f.ID, err)
		}
	}
	return nil
}
