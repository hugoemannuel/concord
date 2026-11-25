package channel

import "context"

// CreateSystemInCategory cria um canal de sistema de texto dentro de uma
// categoria (os canais de alerta do servidor dos devs, ADR 0071). Como os
// outros canais de sistema, não pode ser editado nem removido pelo app; o
// tipo (kind) precisa estar no CHECK de channels.system_kind.
func (s *Service) CreateSystemInCategory(ctx context.Context, serverID, categoryID, name, kind, createdBy string) (*Channel, error) {
	ch := systemChannel(serverID, name, kind, createdBy)
	ch.CategoryID = &categoryID
	if err := s.create(ctx, ch, nil); err != nil {
		return nil, err
	}
	return ch, nil
}
