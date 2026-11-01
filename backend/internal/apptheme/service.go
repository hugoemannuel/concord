package apptheme

import "context"

// store é o que o serviço usa do Repository.
type store interface {
	Themes(ctx context.Context, userID string) ([]Theme, error)
	SaveThemes(ctx context.Context, userID string, themes []Theme) error
}

type Service struct {
	repo store
}

func NewService(repo store) *Service {
	return &Service{repo: repo}
}

// Get devolve os temas já no formato v2 (os gravados pela v1 ganham os padrões).
func (s *Service) Get(ctx context.Context, userID string) ([]Theme, error) {
	themes, err := s.repo.Themes(ctx, userID)
	if err != nil {
		return nil, err
	}
	return Migrate(themes), nil
}

// Save troca a lista inteira e devolve a versão limpa (a que ficou gravada).
func (s *Service) Save(ctx context.Context, userID string, in []Theme) ([]Theme, error) {
	themes, err := Normalize(in)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SaveThemes(ctx, userID, themes); err != nil {
		return nil, err
	}
	return themes, nil
}
