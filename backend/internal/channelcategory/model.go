package channelcategory

import "context"

type Category struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
}

type Placement struct {
	ChannelID  string  `json:"channel_id"`
	CategoryID *string `json:"category_id"`
	Position   int     `json:"position"`
}

type Layout struct {
	Categories []Category  `json:"categories"`
	Channels   []Placement `json:"channels"`
}

type Store interface {
	List(context.Context, string) (Layout, error)
	Create(context.Context, string, string) error
	Rename(context.Context, string, string, string) error
	Delete(context.Context, string, string) error
	MoveCategory(context.Context, string, string, string) error
	MoveChannel(context.Context, string, string, *string, *string) error
}
