package event

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/platform/media"
)

const (
	// janitorEvery: de quanto em quanto tempo a faxina confere a pasta de banners.
	janitorEvery = time.Hour
	// janitorGrace: banner enviado há menos que isso ainda pode estar num formulário aberto.
	janitorGrace = 24 * time.Hour
)

// bannerStore é o que a faxina usa da pasta de banners (media.Store).
type bannerStore interface {
	List() ([]media.FileInfo, error)
	Remove(name string) error
}

// bannerRefs diz quais banners de evento ainda estão em uso.
type bannerRefs interface {
	LiveBannerIDs(ctx context.Context) (map[string]bool, error)
}

// BannerJanitor apaga os banners que nenhum evento vivo usa mais: enviados e
// nunca salvos, trocados dentro do formulário, de evento cancelado ou encerrado.
type BannerJanitor struct {
	files bannerStore
	refs  bannerRefs
	now   func() time.Time
	every time.Duration
}

func NewBannerJanitor(files bannerStore, refs bannerRefs) *BannerJanitor {
	return &BannerJanitor{files: files, refs: refs, now: time.Now, every: janitorEvery}
}

// Run faz uma faxina na hora e repete a cada hora até o contexto acabar.
func (j *BannerJanitor) Run(ctx context.Context) {
	ticker := time.NewTicker(j.every)
	defer ticker.Stop()
	for {
		if removed, err := j.Sweep(ctx); err != nil {
			log.Printf("[eventos] faxina dos banners: %v", err)
		} else if len(removed) > 0 {
			log.Printf("[eventos] faxina dos banners: %d arquivo(s) sem uso apagado(s)", len(removed))
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Sweep apaga os arquivos sem evento vivo, mais velhos que o prazo, e devolve os ids.
func (j *BannerJanitor) Sweep(ctx context.Context) ([]string, error) {
	live, err := j.refs.LiveBannerIDs(ctx)
	if err != nil {
		return nil, err
	}
	files, err := j.files.List()
	if err != nil {
		return nil, err
	}
	var removed []string
	for _, f := range files {
		if f.Temp || live[f.ID] || j.now().Sub(f.ModTime) < janitorGrace {
			continue
		}
		if err := j.files.Remove(f.ID); err != nil {
			log.Printf("[eventos] apagar o banner %s: %v", f.ID, err)
			continue
		}
		removed = append(removed, f.ID)
	}
	return removed, nil
}
