package channelcategory

import "gin-quickstart/backend/internal/permission"

// channelMove: o canal saiu de uma categoria e foi para outra (nil = solto).
type channelMove struct {
	Channel  string
	From, To *string
	Fixed    bool
}

// movesBetween: os canais que trocam de categoria entre as duas listas.
func movesBetween(current, next []Placement) []channelMove {
	before := make(map[string]Placement, len(current))
	for _, placement := range current {
		before[placement.ChannelID] = placement
	}
	var moves []channelMove
	for _, placement := range next {
		old, known := before[placement.ChannelID]
		if known && categoryKey(old.CategoryID) != categoryKey(placement.CategoryID) {
			moves = append(moves, channelMove{Channel: placement.ChannelID, From: old.CategoryID, To: placement.CategoryID, Fixed: old.Fixed})
		}
	}
	return moves
}

// overwritesAfterMove decide as regras do canal que trocou de categoria. Canal
// vinculado ou sem regra nenhuma herda o destino; quem tem permissão própria fica
// com ela e aparece como dessincronizado. Em nenhum caso mover abre um canal:
// privado que vai para categoria aberta (ou para fora) continua privado, e abrir
// fica para o "Sincronizar", que é explícito.
func overwritesAfterMove(own []permission.Overwrite, move channelMove, categories map[string][]permission.Overwrite, everyone string) []permission.Overwrite {
	origin := rulesOf(categories, move.From)
	linked := move.From != nil && permission.SameOverwrites(own, origin)
	current := own
	if move.From != nil && !linked {
		current = permission.SealOverwrites(own, origin, everyone)
	}
	if move.To == nil {
		return current
	}
	destination := rulesOf(categories, move.To)
	inherits := linked || len(current) == 0
	if inherits && (!permission.RestrictsView(current) || permission.RestrictsView(destination)) {
		return destination
	}
	return current
}

func rulesOf(categories map[string][]permission.Overwrite, category *string) []permission.Overwrite {
	if category == nil {
		return nil
	}
	return categories[*category]
}
