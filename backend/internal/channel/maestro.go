package channel

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// MaestroChannels lista o canal de sistema do Maestro (#musica) de todos os
// servidores. Só o essencial (id, servidor e nome): é para varrer no boot.
func (r *Repository) MaestroChannels(ctx context.Context) ([]Channel, error) {
	rows, err := r.db.Query(
		ctx,
		`SELECT id, server_id, name FROM channels WHERE system_kind = $1 AND type = $2`,
		SystemKindMaestro,
		TypeText,
	)
	if err != nil {
		return nil, fmt.Errorf("listar canais do Maestro: %w", err)
	}
	out, err := pgx.CollectRows(rows, scanMaestroChannel)
	if err != nil {
		return nil, fmt.Errorf("ler canais do Maestro: %w", err)
	}
	return out, nil
}

func scanMaestroChannel(row pgx.CollectableRow) (Channel, error) {
	kind := SystemKindMaestro
	ch := Channel{Type: TypeText, IsSystem: true, SystemKind: &kind}
	err := row.Scan(&ch.ID, &ch.ServerID, &ch.Name)
	return ch, err
}

// OnSystemCreated registra um hook chamado depois que o canal do Maestro de um
// servidor novo é criado (só no boot). Quem registra decide o que postar nele.
func (s *Service) OnSystemCreated(fn func(ctx context.Context, ch *Channel)) {
	s.onSystemCreated = append(s.onSystemCreated, fn)
}

func (s *Service) notifySystemCreated(ctx context.Context, ch *Channel) {
	for _, fn := range s.onSystemCreated {
		fn(ctx, ch)
	}
}
