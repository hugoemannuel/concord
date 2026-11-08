package linkpreview

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

const (
	janitorEvery = time.Hour
	// orphanGrace: a imagem é gravada segundos antes da linha; mais nova que
	// isso pode estar no meio de uma busca.
	orphanGrace = time.Hour
)

type janitorStore interface {
	DeleteExpired(ctx context.Context, before time.Time) (int64, error)
	ImageIDs(ctx context.Context) (map[string]bool, error)
}

type janitorFiles interface {
	List() ([]media.FileInfo, error)
	Remove(name string) error
}

// Janitor apaga as linhas vencidas do cache e as imagens que nenhuma linha
// usa mais (vencidas, trocadas numa nova busca, downloads interrompidos).
type Janitor struct {
	store janitorStore
	files janitorFiles
	now   func() time.Time
}

func NewJanitor(store janitorStore, files janitorFiles) *Janitor {
	return &Janitor{store: store, files: files, now: time.Now}
}

// Run faz uma faxina na hora e repete a cada hora até o contexto acabar.
func (j *Janitor) Run(ctx context.Context) {
	ticker := time.NewTicker(janitorEvery)
	defer ticker.Stop()
	for {
		logSweep(j.Sweep(ctx))
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// logSweep registra a faxina só quando algo aconteceu.
func logSweep(rows int64, files int, err error) {
	switch {
	case err != nil:
		log.Printf("[linkpreview] faxina: %v", err)
	case rows > 0 || files > 0:
		log.Printf("[linkpreview] faxina: %d prévia(s) vencida(s), %d imagem(ns) apagada(s)", rows, files)
	}
}

// Sweep apaga as linhas vencidas e depois os arquivos sem linha.
func (j *Janitor) Sweep(ctx context.Context) (int64, int, error) {
	rows, err := j.store.DeleteExpired(ctx, j.now().Add(-cacheTTL))
	if err != nil {
		return 0, 0, err
	}
	used, err := j.store.ImageIDs(ctx)
	if err != nil {
		return rows, 0, err
	}
	files, err := j.files.List()
	if err != nil {
		return rows, 0, err
	}
	return rows, j.removeOrphans(files, used), nil
}

func (j *Janitor) removeOrphans(files []media.FileInfo, used map[string]bool) int {
	removed := 0
	for _, f := range files {
		if (used[f.ID] && !f.Temp) || j.now().Sub(f.ModTime) < orphanGrace {
			continue
		}
		if err := j.files.Remove(f.Name); err != nil {
			log.Printf("[linkpreview] apagar a imagem %s: %v", f.Name, err)
			continue
		}
		removed++
	}
	return removed
}
