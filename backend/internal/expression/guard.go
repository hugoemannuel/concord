package expression

import (
	"context"
	"regexp"
	"strings"

	"gin-quickstart/backend/internal/permission"
)

// tokenRe: o emoji no texto, <:nome:id> (o mesmo formato de emojiToken.ts).
var tokenRe = regexp.MustCompile(`<:([A-Za-z0-9_]{2,32}):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>`)

// Guard aplica a regra na hora de enviar: o item do próprio servidor sempre
// passa; o de fora pede ser membro da origem e, em canal, a permissão.
type Guard struct {
	store  Store
	access Access
}

func NewGuard(store Store, access Access) *Guard {
	return &Guard{store: store, access: access}
}

// useCheck decide por uma mensagem só: guarda o resultado por servidor, para
// não repetir a consulta quando o texto tem vários emojis.
type useCheck struct {
	guard   *Guard
	dest    Destination
	userID  string
	decided map[string]bool
}

func (g *Guard) newCheck(dest Destination, userID string) *useCheck {
	return &useCheck{guard: g, dest: dest, userID: userID, decided: map[string]bool{}}
}

// external: o item vem de fora do servidor de destino (DM conta como fora).
func (c *useCheck) external(originServerID string) bool {
	return c.dest.ServerID == "" || originServerID != c.dest.ServerID
}

func (c *useCheck) allowed(ctx context.Context, originServerID string) (bool, error) {
	if !c.external(originServerID) {
		return true, nil
	}
	if ok, done := c.decided[originServerID]; done {
		return ok, nil
	}
	ok, err := c.allowedExternal(ctx, originServerID)
	if err != nil {
		return false, err
	}
	c.decided[originServerID] = ok
	return ok, nil
}

// allowedExternal: o canal manda, mesmo sem servidor resolvido (a consulta do
// servidor pode falhar e isso não pode virar "DM", que não pede a permissão).
func (c *useCheck) allowedExternal(ctx context.Context, originServerID string) (bool, error) {
	member, err := c.guard.access.IsMember(ctx, originServerID, c.userID)
	if err != nil || !member {
		return false, err
	}
	if c.dest.ChannelID == "" {
		return true, nil
	}
	perms, err := c.guard.access.ChannelPerms(ctx, c.dest.ChannelID, c.userID)
	if err != nil {
		return false, err
	}
	return permission.Has(perms, permission.UseExternalEmojis), nil
}

// SanitizeContent devolve o texto em que todo <:nome:id> pode mesmo ser usado
// por quem envia, com o nome de verdade; o resto vira o texto :nome:. Marca como
// publicados os de fora, para quem recebe conseguir ver a imagem.
func (g *Guard) SanitizeContent(ctx context.Context, dest Destination, userID, content string) (string, error) {
	if !strings.Contains(content, "<:") {
		return content, nil
	}
	refs, err := g.store.EmojisByID(ctx, tokenIDs(content))
	if err != nil {
		return "", err
	}
	check := g.newCheck(dest, userID)
	allowed := map[string]EmojiRef{}
	var publish []string
	for id, ref := range refs {
		ok, err := check.allowed(ctx, ref.ServerID)
		if err != nil {
			return "", err
		}
		if !ok {
			continue
		}
		allowed[id] = ref
		if check.external(ref.ServerID) {
			publish = append(publish, id)
		}
	}
	if len(publish) > 0 {
		if err := g.store.PublishEmojis(ctx, publish); err != nil {
			return "", err
		}
	}
	return rewriteTokens(content, allowed), nil
}

// tokenIDs: os ids (minúsculos e sem repetir) dos emojis do texto.
func tokenIDs(content string) []string {
	seen := map[string]bool{}
	var ids []string
	for _, m := range tokenRe.FindAllStringSubmatch(content, -1) {
		id := strings.ToLower(m[2])
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids
}

func rewriteTokens(content string, allowed map[string]EmojiRef) string {
	return tokenRe.ReplaceAllStringFunc(content, func(token string) string {
		m := tokenRe.FindStringSubmatch(token)
		id := strings.ToLower(m[2])
		if ref, ok := allowed[id]; ok {
			return "<:" + ref.Name + ":" + id + ">"
		}
		return ":" + m[1] + ":"
	})
}

// CheckSticker: a figurinha pode ir neste destino? A de fora fica publicada.
func (g *Guard) CheckSticker(ctx context.Context, dest Destination, userID, stickerID string) error {
	serverID, err := g.store.StickerServer(ctx, stickerID)
	if err != nil {
		return err
	}
	check := g.newCheck(dest, userID)
	ok, err := check.allowed(ctx, serverID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	if check.external(serverID) {
		return g.store.PublishSticker(ctx, stickerID)
	}
	return nil
}

// CheckReaction: o emoji pode virar reação neste destino? O de fora fica publicado.
func (g *Guard) CheckReaction(ctx context.Context, dest Destination, userID, emojiID string) error {
	refs, err := g.store.EmojisByID(ctx, []string{emojiID})
	if err != nil {
		return err
	}
	ref, found := refs[emojiID]
	if !found {
		return ErrUnknownEmoji
	}
	check := g.newCheck(dest, userID)
	ok, err := check.allowed(ctx, ref.ServerID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	if check.external(ref.ServerID) {
		return g.store.PublishEmojis(ctx, []string{emojiID})
	}
	return nil
}
