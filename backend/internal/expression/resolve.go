package expression

import (
	"context"
	"log"
)

// MaxResolve: quantos ids cabem num pedido (uma tela de mensagens não passa disso).
const MaxResolve = 100

// Origin: de onde vem o item, para quem clica nele. Servidor privado, para quem
// não é membro, só diz que é privado: nem nome nem ícone.
type Origin struct {
	ServerName    string  `json:"server_name,omitempty"`
	ServerIconURL *string `json:"server_icon_url,omitempty"`
	Private       bool    `json:"private,omitempty"`
}

// Resolved: o que quem recebeu a mensagem pode saber de um emoji ou figurinha.
// O item que a pessoa não pode conhecer nem aparece na resposta.
type Resolved struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Deleted bool    `json:"deleted,omitempty"`
	Origin  *Origin `json:"origin,omitempty"`
}

// ResolvedSet: a resposta de POST /expressions/resolve.
type ResolvedSet struct {
	Emojis   []Resolved `json:"emojis"`
	Stickers []Resolved `json:"stickers"`
}

// OriginStore: as consultas da resolução (Repository).
type OriginStore interface {
	VisibleEmojis(ctx context.Context, ids []string, viewerID string) ([]OriginRow, error)
	VisibleStickers(ctx context.Context, ids []string, viewerID string) ([]OriginRow, error)
	DeletedEmojis(ctx context.Context, ids []string) (map[string]string, error)
	PrivateServers(ctx context.Context, ids []string) (map[string]bool, error)
}

// Resolver diz o que cada id é, sem vazar servidor privado.
type Resolver struct {
	store OriginStore
}

func NewResolver(store OriginStore) *Resolver {
	return &Resolver{store: store}
}

func (r *Resolver) Resolve(ctx context.Context, viewerID string, emojiIDs, stickerIDs []string) (ResolvedSet, error) {
	emojis, err := r.store.VisibleEmojis(ctx, emojiIDs, viewerID)
	if err != nil {
		return ResolvedSet{}, err
	}
	stickers, err := r.store.VisibleStickers(ctx, stickerIDs, viewerID)
	if err != nil {
		return ResolvedSet{}, err
	}
	deleted, err := r.store.DeletedEmojis(ctx, emojiIDs)
	if err != nil {
		return ResolvedSet{}, err
	}
	private := r.privateServers(ctx, append(emojis[:len(emojis):len(emojis)], stickers...))
	set := ResolvedSet{Emojis: withOrigins(emojis, private), Stickers: withOrigins(stickers, private)}
	for id, name := range deleted {
		set.Emojis = append(set.Emojis, Resolved{ID: id, Name: name, Deleted: true})
	}
	return set, nil
}

// privateServers: os privados entre os servidores de que a pessoa não é membro.
// Se a consulta falhar, todos contam como privados: não dá para confirmar que
// o nome pode sair, e ele não é essencial para ver o emoji.
func (r *Resolver) privateServers(ctx context.Context, rows []OriginRow) map[string]bool {
	var ids []string
	for _, row := range rows {
		if !row.Member {
			ids = append(ids, row.ServerID)
		}
	}
	private, err := r.store.PrivateServers(ctx, ids)
	if err == nil {
		return private
	}
	log.Printf("[expression] servidores privados: %v", err)
	private = map[string]bool{}
	for _, id := range ids {
		private[id] = true
	}
	return private
}

func withOrigins(rows []OriginRow, private map[string]bool) []Resolved {
	out := make([]Resolved, 0, len(rows))
	for _, row := range rows {
		out = append(out, Resolved{ID: row.ID, Name: row.Name, Origin: originFor(row, private)})
	}
	return out
}

func originFor(row OriginRow, private map[string]bool) *Origin {
	if !row.Member && private[row.ServerID] {
		return &Origin{Private: true}
	}
	return &Origin{ServerName: row.ServerName, ServerIconURL: row.ServerIconURL}
}
