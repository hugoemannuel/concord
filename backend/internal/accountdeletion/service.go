package accountdeletion

import (
	"context"
	"log"
)

type eraser interface {
	Erase(ctx context.Context, userID string) (*Erasure, error)
}

// FileRemover é a pasta de uploads (media.Store).
type FileRemover interface {
	Remove(name string) error
}

// Service exclui a conta: o banco numa transação (Repository) e, depois do
// commit, os arquivos e os efeitos fora do banco (ganchos ligados no cmd:
// eventos do hub, caches, sessões).
type Service struct {
	repo  eraser
	files map[FileKind][]FileRemover
	hooks []func(userID string, e *Erasure)
}

func NewService(repo eraser) *Service {
	return &Service{repo: repo, files: map[FileKind][]FileRemover{}}
}

// SetFiles diz em que pastas ficam os arquivos de um tipo (o avatar tem duas:
// o arquivo e o quadro parado).
func (s *Service) SetFiles(kind FileKind, stores ...FileRemover) {
	s.files[kind] = stores
}

// OnDeleted roda depois do commit (derrubar conexões, avisar servidores...).
func (s *Service) OnDeleted(fn func(userID string, e *Erasure)) {
	s.hooks = append(s.hooks, fn)
}

func (s *Service) Delete(ctx context.Context, userID string) error {
	erasure, err := s.repo.Erase(ctx, userID)
	if err != nil {
		return err
	}
	removed := s.removeFiles(erasure.Files)
	for _, hook := range s.hooks {
		hook(userID, erasure)
	}
	log.Printf("[conta] %s excluída: %d arquivo(s) apagado(s), %d servidor(es) apagado(s)", userID, removed, len(erasure.DeletedServers))
	return nil
}

// removeFiles apaga do disco; a conta já saiu do banco, então uma falha só
// vai para o log (o arquivo fica órfão, sem ligação com ninguém).
func (s *Service) removeFiles(files []File) int {
	removed := 0
	for _, f := range files {
		for _, store := range s.files[f.Kind] {
			if err := store.Remove(f.ID); err != nil {
				log.Printf("[conta] apagar %s/%s: %v", f.Kind, f.ID, err)
				continue
			}
			removed++
		}
	}
	return removed
}
