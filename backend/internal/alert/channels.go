package alert

import (
	"context"
	"fmt"
)

// Os canais de alerta no servidor de ALERTS_SERVER_ID: garantidos no boot, de
// forma idempotente (cria só o que falta; o que existe é reaproveitado pelo
// tipo, mesmo renomeado ou movido). Um canal por quem age: infra e serviços,
// erros do app (parte 2), qualidade das calls e lives, e o resumo do dia
// (parte 2).

// CategoryName: a categoria onde os canais nascem.
const CategoryName = "Monitoramento"

// ChannelSpec: o tipo (channels.system_kind) e o nome com que o canal nasce.
type ChannelSpec struct {
	Kind ChannelKind
	Name string
}

// ChannelSpecs: os canais, na ordem em que aparecem na categoria.
var ChannelSpecs = []ChannelSpec{
	{ChannelInfra, "alertas"},
	{ChannelErrors, "erros"},
	{ChannelQuality, "qualidade"},
	{ChannelDaily, "resumo-diario"},
}

// ChannelStore: o que garantir os canais precisa (ligado em cmd/wire_alerts.go
// ao channel e ao channelcategory).
type ChannelStore interface {
	// SystemChannelID: o canal de sistema desse tipo no servidor ("" = não há).
	SystemChannelID(ctx context.Context, serverID string, kind ChannelKind) (string, error)
	// CategoryID: a categoria com esse nome ("" = não há).
	CategoryID(ctx context.Context, serverID, name string) (string, error)
	CreateCategory(ctx context.Context, serverID, name string) (string, error)
	CreateChannel(ctx context.Context, serverID, categoryID, name string, kind ChannelKind) (string, error)
}

// EnsureChannels devolve o id de cada canal de alerta, criando os que faltam.
func EnsureChannels(ctx context.Context, store ChannelStore, serverID string) (map[ChannelKind]string, error) {
	out := map[ChannelKind]string{}
	category := ""
	for _, spec := range ChannelSpecs {
		id, err := ensureChannel(ctx, store, serverID, spec, &category)
		if err != nil {
			return nil, fmt.Errorf("canal #%s: %w", spec.Name, err)
		}
		out[spec.Kind] = id
	}
	return out, nil
}

// ensureChannel: o canal do tipo, ou um novo na categoria (achada ou criada
// só quando algum canal falta).
func ensureChannel(ctx context.Context, store ChannelStore, serverID string, spec ChannelSpec, category *string) (string, error) {
	id, err := store.SystemChannelID(ctx, serverID, spec.Kind)
	if err != nil || id != "" {
		return id, err
	}
	if *category == "" {
		if *category, err = ensureCategory(ctx, store, serverID); err != nil {
			return "", err
		}
	}
	return store.CreateChannel(ctx, serverID, *category, spec.Name, spec.Kind)
}

func ensureCategory(ctx context.Context, store ChannelStore, serverID string) (string, error) {
	id, err := store.CategoryID(ctx, serverID, CategoryName)
	if err != nil || id != "" {
		return id, err
	}
	return store.CreateCategory(ctx, serverID, CategoryName)
}
