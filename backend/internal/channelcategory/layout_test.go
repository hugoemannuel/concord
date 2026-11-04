package channelcategory

import (
	"errors"
	"reflect"
	"testing"
)

func cat(id string) *string { return &id }

// current: categorias a e b; "oculto" fica em a, entre a1 e a2.
func layoutFixture() Layout {
	return Layout{
		Categories: []Category{{ID: "a"}, {ID: "b"}},
		Channels: []Placement{
			{ChannelID: "livre", Position: 0},
			{ChannelID: "a1", CategoryID: cat("a"), Position: 0},
			{ChannelID: "oculto", CategoryID: cat("a"), Position: 1},
			{ChannelID: "a2", CategoryID: cat("a"), Position: 2},
			{ChannelID: "b1", CategoryID: cat("b"), Position: 0},
		},
	}
}

func allButHidden(id string) bool { return id != "oculto" }

func groupOf(placements []Placement, category *string) []string {
	ids := []string{}
	for _, p := range placements {
		if categoryKey(p.CategoryID) == categoryKey(category) {
			ids = append(ids, p.ChannelID)
		}
	}
	return ids
}

func TestPlanLayout(t *testing.T) {
	t.Run("reordena categorias sem tocar nos canais delas", func(t *testing.T) {
		categories, placements, err := planLayout(layoutFixture(), allButHidden, LayoutWrite{
			Categories: []string{"b", "a"},
			Channels: []Placement{
				{ChannelID: "livre", Position: 0},
				{ChannelID: "a1", CategoryID: cat("a"), Position: 1},
				{ChannelID: "a2", CategoryID: cat("a"), Position: 2},
				{ChannelID: "b1", CategoryID: cat("b"), Position: 3},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(categories, []string{"b", "a"}) {
			t.Errorf("categorias = %v", categories)
		}
		if got := groupOf(placements, cat("a")); !reflect.DeepEqual(got, []string{"a1", "oculto", "a2"}) {
			t.Errorf("grupo a = %v", got)
		}
	})
	t.Run("move canal entre categorias e para fora, com posições sequenciais", func(t *testing.T) {
		_, placements, err := planLayout(layoutFixture(), allButHidden, LayoutWrite{
			Categories: []string{"a", "b"},
			Channels: []Placement{
				{ChannelID: "a1", Position: 0},
				{ChannelID: "livre", Position: 1},
				{ChannelID: "a2", CategoryID: cat("b"), Position: 2},
				{ChannelID: "b1", CategoryID: cat("b"), Position: 3},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if got := groupOf(placements, nil); !reflect.DeepEqual(got, []string{"a1", "livre"}) {
			t.Errorf("sem categoria = %v", got)
		}
		if got := groupOf(placements, cat("b")); !reflect.DeepEqual(got, []string{"a2", "b1"}) {
			t.Errorf("grupo b = %v", got)
		}
		if got := groupOf(placements, cat("a")); !reflect.DeepEqual(got, []string{"oculto"}) {
			t.Errorf("grupo a = %v (o oculto não sai da categoria)", got)
		}
		for _, p := range placements {
			if p.ChannelID == "b1" && p.Position != 1 {
				t.Errorf("posição de b1 = %d", p.Position)
			}
		}
	})
	t.Run("canal oculto mantém o lugar quando a ordem dos visíveis muda", func(t *testing.T) {
		_, placements, err := planLayout(layoutFixture(), allButHidden, LayoutWrite{
			Categories: []string{"a", "b"},
			Channels: []Placement{
				{ChannelID: "livre", Position: 0},
				{ChannelID: "a2", CategoryID: cat("a"), Position: 0},
				{ChannelID: "a1", CategoryID: cat("a"), Position: 1},
				{ChannelID: "b1", CategoryID: cat("b"), Position: 0},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if got := groupOf(placements, cat("a")); !reflect.DeepEqual(got, []string{"a2", "oculto", "a1"}) {
			t.Errorf("grupo a = %v", got)
		}
	})
	visible := []Placement{{ChannelID: "livre"}, {ChannelID: "a1"}, {ChannelID: "a2"}, {ChannelID: "b1"}}
	for _, tc := range []struct {
		name  string
		write LayoutWrite
	}{
		{"categoria faltando", LayoutWrite{Categories: []string{"a"}, Channels: visible}},
		{"categoria repetida", LayoutWrite{Categories: []string{"a", "a"}, Channels: visible}},
		{"categoria de outro servidor na ordem", LayoutWrite{Categories: []string{"a", "x"}, Channels: visible}},
		{"canal faltando", LayoutWrite{Categories: []string{"a", "b"}, Channels: visible[:3]}},
		{"canal repetido", LayoutWrite{Categories: []string{"a", "b"}, Channels: []Placement{{ChannelID: "livre"}, {ChannelID: "a1"}, {ChannelID: "a1"}, {ChannelID: "b1"}}}},
		{"canal de outro servidor", LayoutWrite{Categories: []string{"a", "b"}, Channels: []Placement{{ChannelID: "livre"}, {ChannelID: "a1"}, {ChannelID: "a2"}, {ChannelID: "fora"}}}},
		{"canal oculto no pedido", LayoutWrite{Categories: []string{"a", "b"}, Channels: []Placement{{ChannelID: "livre"}, {ChannelID: "a1"}, {ChannelID: "a2"}, {ChannelID: "oculto"}}}},
		{"canal em categoria de outro servidor", LayoutWrite{Categories: []string{"a", "b"}, Channels: []Placement{{ChannelID: "livre", CategoryID: cat("x")}, {ChannelID: "a1"}, {ChannelID: "a2"}, {ChannelID: "b1"}}}},
	} {
		t.Run("recusa "+tc.name, func(t *testing.T) {
			if _, _, err := planLayout(layoutFixture(), allButHidden, tc.write); !errors.Is(err, ErrInvalidLayout) {
				t.Fatalf("erro = %v, quer ErrInvalidLayout", err)
			}
		})
	}
}

func TestLayoutRevision(t *testing.T) {
	base := layoutFixture()
	first := layoutRevision(base)
	if first == "" || first != layoutRevision(layoutFixture()) {
		t.Fatalf("revisão instável: %q", first)
	}
	t.Run("muda com a ordem das categorias", func(t *testing.T) {
		other := layoutFixture()
		other.Categories[0], other.Categories[1] = other.Categories[1], other.Categories[0]
		if layoutRevision(other) == first {
			t.Fatal("não mudou")
		}
	})
	t.Run("muda com a categoria do canal", func(t *testing.T) {
		other := layoutFixture()
		other.Channels[4].CategoryID = cat("a")
		if layoutRevision(other) == first {
			t.Fatal("não mudou")
		}
	})
	t.Run("não muda com o entrelaçamento de grupos diferentes", func(t *testing.T) {
		other := layoutFixture()
		other.Channels = []Placement{other.Channels[4], other.Channels[0], other.Channels[1], other.Channels[2], other.Channels[3]}
		if layoutRevision(other) != first {
			t.Fatal("mudou")
		}
	})
	t.Run("só enxerga o que o membro vê", func(t *testing.T) {
		hidden := layoutFixture()
		hidden.Channels[2].CategoryID = cat("b")
		if layoutRevision(visibleLayout(hidden, allButHidden)) != layoutRevision(visibleLayout(base, allButHidden)) {
			t.Fatal("canal oculto mudou a revisão de quem não o vê")
		}
	})
}
