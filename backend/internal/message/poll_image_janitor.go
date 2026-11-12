package message

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

// Faxina das imagens de enquete: apaga os arquivos que nenhuma resposta usa
// mais (mensagem apagada, enquete que falhou depois do download, download
// interrompido).

const (
	pollImageJanitorEvery = time.Hour
	// pollImageGrace: a imagem é gravada antes da enquete; mais nova que isso
	// pode estar no meio de uma criação.
	pollImageGrace = time.Hour
)

type pollImageRefs interface {
	PollImageURLs(ctx context.Context) ([]string, error)
}

type pollImageJanitorFiles interface {
	List() ([]media.FileInfo, error)
	Remove(name string) error
}

type PollImageJanitor struct {
	refs  pollImageRefs
	files pollImageJanitorFiles
	now   func() time.Time
}

func NewPollImageJanitor(refs pollImageRefs, files pollImageJanitorFiles) *PollImageJanitor {
	return &PollImageJanitor{refs: refs, files: files, now: time.Now}
}

// Run faz uma faxina na hora e repete a cada hora até o contexto acabar.
func (j *PollImageJanitor) Run(ctx context.Context) {
	ticker := time.NewTicker(pollImageJanitorEvery)
	defer ticker.Stop()
	for {
		logPollImageSweep(j.Sweep(ctx))
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// logPollImageSweep registra a faxina só quando algo aconteceu.
func logPollImageSweep(removed int, err error) {
	switch {
	case err != nil:
		log.Printf("[enquete] faxina das imagens: %v", err)
	case removed > 0:
		log.Printf("[enquete] faxina: %d imagem(ns) apagada(s)", removed)
	}
}

// Sweep apaga os arquivos sem resposta que os use. Sem ler o banco, não apaga nada.
func (j *PollImageJanitor) Sweep(ctx context.Context) (int, error) {
	urls, err := j.refs.PollImageURLs(ctx)
	if err != nil {
		return 0, err
	}
	files, err := j.files.List()
	if err != nil {
		return 0, err
	}
	used := pollImageIDs(urls)
	removed := 0
	for _, f := range files {
		if (used[f.ID] && !f.Temp) || j.now().Sub(f.ModTime) < pollImageGrace {
			continue
		}
		if err := j.files.Remove(f.Name); err != nil {
			log.Printf("[enquete] apagar a imagem %s: %v", f.Name, err)
			continue
		}
		removed++
	}
	return removed, nil
}
