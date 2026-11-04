package channelcategory

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
)

var (
	// ErrInvalidLayout: o pedido não é uma permutação do que o membro vê (id
	// faltando, repetido ou de outro servidor).
	ErrInvalidLayout = errors.New("a nova ordem precisa listar cada categoria e canal do servidor uma vez")
	// ErrLayoutConflict: outra pessoa mudou a lista depois que o cliente a leu.
	ErrLayoutConflict = errors.New("a lista de canais mudou")
)

// LayoutWrite é a nova organização vista pelo membro: as categorias na ordem e
// os canais que ele enxerga com categoria e posição. Revision é a revisão que
// ele leu; se a lista mudou desde então, nada é gravado.
type LayoutWrite struct {
	Revision   string      `json:"revision"`
	Categories []string    `json:"categories"`
	Channels   []Placement `json:"channels"`
}

// SaveResult: a revisão depois da gravação e se algo mudou de fato.
type SaveResult struct {
	Revision string
	Changed  bool
}

// categoryKey: a chave do grupo do canal; "" é a lista sem categoria.
func categoryKey(category *string) string {
	if category == nil {
		return ""
	}
	return *category
}

// visibleLayout: a organização sem os canais que o membro não vê.
func visibleLayout(layout Layout, canView func(string) bool) Layout {
	visible := make([]Placement, 0, len(layout.Channels))
	for _, placement := range layout.Channels {
		if canView(placement.ChannelID) {
			visible = append(visible, placement)
		}
	}
	return Layout{Categories: layout.Categories, Channels: visible}
}

// layoutRevision resume a ordem das categorias e a de cada grupo de canais. É
// calculada na hora a partir do que está gravado, então toda mudança conta,
// venha de qual rota vier, sem coluna para manter em dia.
func layoutRevision(layout Layout) string {
	hash := sha256.New()
	for _, category := range layout.Categories {
		fmt.Fprintf(hash, "c:%s\n", category.ID)
	}
	placements := append([]Placement(nil), layout.Channels...)
	sort.SliceStable(placements, func(i, j int) bool {
		return categoryKey(placements[i].CategoryID) < categoryKey(placements[j].CategoryID)
	})
	for _, placement := range placements {
		fmt.Fprintf(hash, "p:%s:%s\n", categoryKey(placement.CategoryID), placement.ChannelID)
	}
	return hex.EncodeToString(hash.Sum(nil))[:32]
}

// layoutPlan: o que gravar e a revisão que o membro via antes.
type layoutPlan struct {
	categories []string
	placements []Placement
	seen       string
}

// planSave recusa quem leu uma lista que já mudou e monta a ordem final.
func planSave(current Layout, canView func(string) bool, write LayoutWrite) (layoutPlan, error) {
	seen := layoutRevision(visibleLayout(current, canView))
	if seen != write.Revision {
		return layoutPlan{}, ErrLayoutConflict
	}
	categories, placements, err := planLayout(current, canView, write)
	if err != nil {
		return layoutPlan{}, err
	}
	return layoutPlan{categories: categories, placements: placements, seen: seen}, nil
}

// planLayout confere o pedido contra o que está gravado e devolve a ordem final
// das categorias e de todos os canais. Canal que o membro não vê não entra no
// pedido: fica na categoria e no índice dele, entre os que foram movidos.
func planLayout(current Layout, canView func(string) bool, write LayoutWrite) ([]string, []Placement, error) {
	known := make(map[string]bool, len(current.Categories))
	currentCategories := make([]string, 0, len(current.Categories))
	for _, category := range current.Categories {
		known[category.ID] = true
		currentCategories = append(currentCategories, category.ID)
	}
	if !samePermutation(currentCategories, write.Categories) {
		return nil, nil, ErrInvalidLayout
	}
	if err := validateChannels(visibleLayout(current, canView).Channels, write.Channels, known); err != nil {
		return nil, nil, err
	}
	return write.Categories, mergeGroups(current, canView, write.Channels), nil
}

func samePermutation(current, requested []string) bool {
	if len(current) != len(requested) {
		return false
	}
	remaining := make(map[string]bool, len(current))
	for _, id := range current {
		remaining[id] = true
	}
	for _, id := range requested {
		if !remaining[id] {
			return false
		}
		delete(remaining, id)
	}
	return true
}

func validateChannels(visible, requested []Placement, known map[string]bool) error {
	currentIDs := make([]string, 0, len(visible))
	for _, placement := range visible {
		currentIDs = append(currentIDs, placement.ChannelID)
	}
	requestedIDs := make([]string, 0, len(requested))
	for _, placement := range requested {
		if placement.CategoryID != nil && !known[*placement.CategoryID] {
			return ErrInvalidLayout
		}
		requestedIDs = append(requestedIDs, placement.ChannelID)
	}
	if !samePermutation(currentIDs, requestedIDs) {
		return ErrInvalidLayout
	}
	return nil
}

// mergeGroups monta cada grupo: os visíveis na ordem pedida e os ocultos de
// volta no índice que tinham (ou no fim, se o grupo encolheu).
func mergeGroups(current Layout, canView func(string) bool, requested []Placement) []Placement {
	groups := make(map[string][]Placement)
	ordered := append([]Placement(nil), requested...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].Position < ordered[j].Position })
	for _, placement := range ordered {
		key := categoryKey(placement.CategoryID)
		groups[key] = append(groups[key], placement)
	}
	for key, hidden := range hiddenByIndex(current, canView) {
		for _, item := range hidden {
			groups[key] = insertAt(groups[key], item.index, item.placement)
		}
	}
	return flattenGroups(groups)
}

type hiddenPlacement struct {
	index     int
	placement Placement
}

func hiddenByIndex(current Layout, canView func(string) bool) map[string][]hiddenPlacement {
	seen := make(map[string]int)
	hidden := make(map[string][]hiddenPlacement)
	for _, placement := range current.Channels {
		key := categoryKey(placement.CategoryID)
		if !canView(placement.ChannelID) {
			hidden[key] = append(hidden[key], hiddenPlacement{seen[key], placement})
		}
		seen[key]++
	}
	return hidden
}

func insertAt(group []Placement, index int, placement Placement) []Placement {
	index = min(index, len(group))
	group = append(group, Placement{})
	copy(group[index+1:], group[index:])
	group[index] = placement
	return group
}

func flattenGroups(groups map[string][]Placement) []Placement {
	placements := []Placement{}
	for _, group := range groups {
		for position, placement := range group {
			placement.Position = position
			placements = append(placements, placement)
		}
	}
	return placements
}
