package channelcategory

import (
	"context"

	"gin-quickstart/backend/internal/permission"
)

type Category struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	// Overwrites: quem vê a categoria. Só vai para quem já a enxerga.
	Overwrites []permission.Overwrite `json:"overwrites" db:"-"`
}

type Placement struct {
	ChannelID  string  `json:"channel_id"`
	CategoryID *string `json:"category_id"`
	Position   int     `json:"position"`
	// Synced: o canal segue as permissões da categoria dele.
	Synced bool `json:"synced" db:"-"`
	// Fixed: canal de sistema ou de evento. Não recebe regras de categoria (a
	// categoria só o esconde) e nunca aparece como dessincronizado.
	Fixed bool `json:"-"`
}

type Layout struct {
	Categories []Category  `json:"categories"`
	Channels   []Placement `json:"channels"`
	// Revision identifica o que o membro está vendo: volta na gravação da ordem.
	Revision string `json:"revision"`
}

// Viewer: o que o membro que faz o pedido enxerga.
type Viewer struct {
	Channel  func(id string) bool
	Category func(id string) bool
}

// OverwriteChange calcula as regras novas da categoria a partir das atuais.
type OverwriteChange func(current []permission.Overwrite) ([]permission.Overwrite, error)

// CategoryUpdate: o que muda na categoria. Name vazio não renomeia; Overwrites nil
// não mexe nas permissões.
type CategoryUpdate struct {
	Name       string
	Overwrites OverwriteChange
}

// CategoryChange: como a categoria estava e como ficou.
type CategoryChange struct {
	Before, After Category
	// Synced: quantos canais vinculados receberam as regras novas.
	Synced int
}

type Store interface {
	List(context.Context, string) (Layout, error)
	Create(ctx context.Context, server, name string, overwrites []permission.Overwrite) (Category, error)
	Update(ctx context.Context, server, id string, update CategoryUpdate) (CategoryChange, error)
	Delete(ctx context.Context, server, id string) (Category, error)
	MoveCategory(context.Context, string, string, string) error
	MoveChannel(context.Context, string, string, *string, *string) error
	SaveLayout(ctx context.Context, server string, write LayoutWrite, viewer Viewer) (SaveResult, error)
	SyncChannel(ctx context.Context, server, channel string) (Category, error)
}
