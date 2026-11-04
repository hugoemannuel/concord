package serverprofile

import (
	"errors"
	"strings"
	"testing"
)

func ptr[T any](v T) *T { return &v }

func TestApplyPatchValida(t *testing.T) {
	cases := []struct {
		name  string
		patch Patch
		ok    bool
	}{
		{"vazio não muda nada", Patch{}, true},
		{"degradê da paleta", Patch{Banner: &Art{Preset: "azul"}}, true},
		{"degradê desconhecido", Patch{Banner: &Art{Preset: "url(evil)"}}, false},
		{"imagem nossa", Patch{Banner: &Art{Image: ImagePath + "0b6d1c9e-6c1a-4f53-9f7d-1a2b3c4d5e6f"}}, true},
		{"imagem de fora", Patch{Banner: &Art{Image: "https://evil.example/x.png"}}, false},
		{"imagem com caminho estranho", Patch{Strip: &Art{Image: ImagePath + "../../etc/passwd"}}, false},
		{"seis traços", Patch{Traits: ptr(make6Traits())}, false},
		{"traço longo", Patch{Traits: ptr([]Trait{{Emoji: "🎮", Text: strings.Repeat("a", MaxTraitText+1)}})}, false},
		{"traço com controle", Patch{Traits: ptr([]Trait{{Text: "a\nb"}})}, false},
		{"emoji longo", Patch{Traits: ptr([]Trait{{Emoji: strings.Repeat("🎮", MaxTraitEmoji+1), Text: "a"}})}, false},
		{"emoji com letra", Patch{Traits: ptr([]Trait{{Emoji: "abc", Text: "a"}})}, false},
		{"emoji do servidor", Patch{Traits: ptr([]Trait{{Emoji: "<:123>", Text: "a"}})}, false},
		{"emoji de tecla", Patch{Traits: ptr([]Trait{{Emoji: "1\ufe0f\u20e3", Text: "a"}})}, true},
		{"emoji de família", Patch{Traits: ptr([]Trait{{Emoji: "👨\u200d👩\u200d👧", Text: "a"}})}, true},
		{"descrição no limite", Patch{Description: ptr(strings.Repeat("á", MaxDescription))}, true},
		{"descrição longa", Patch{Description: ptr(strings.Repeat("á", MaxDescription+1))}, false},
		{"jogos demais", Patch{Games: ptr(manyGames(9))}, false},
		{"jogo sem nome", Patch{Games: ptr([]Game{{Name: "  "}})}, false},
		{"jogo com hash inválido", Patch{Games: ptr([]Game{{Name: "X", AppID: 1, IconHash: "zz"}})}, false},
		{"jogo com app negativo", Patch{Games: ptr([]Game{{Name: "X", AppID: -1}})}, false},
		{"jogo da Steam", Patch{Games: ptr([]Game{{Name: "X", AppID: 1, IconHash: strings.Repeat("a", 40)}})}, true},
		{"fundo sem imagem", Patch{Theme: &Theme{Starter: "oceano", Dim: 40}}, true},
		{"fundo com escurecimento fora", Patch{Theme: &Theme{Dim: 101}}, false},
		{"fundo com ponto de partida estranho", Patch{Theme: &Theme{Starter: "a b"}}, false},
		{"tag boa", Patch{Tag: &TagEdit{Name: "WUMP", Badge: "espada", Color: "#AABBCC"}}, true},
		{"tag só com números", Patch{Tag: &TagEdit{Name: "2026", Badge: "raio", Color: "#000000"}}, true},
		{"tag longa", Patch{Tag: &TagEdit{Name: "WUMPS", Badge: "espada", Color: "#000000"}}, false},
		{"tag com símbolo", Patch{Tag: &TagEdit{Name: "A-B", Badge: "espada", Color: "#000000"}}, false},
		{"tag com acento", Patch{Tag: &TagEdit{Name: "AÇÃO", Badge: "espada", Color: "#000000"}}, false},
		{"tag sem emblema", Patch{Tag: &TagEdit{Name: "ABC", Badge: "", Color: "#000000"}}, false},
		{"tag com emblema de fora", Patch{Tag: &TagEdit{Name: "ABC", Badge: "<svg>", Color: "#000000"}}, false},
		{"tag com cor inválida", Patch{Tag: &TagEdit{Name: "ABC", Badge: "raio", Color: "red"}}, false},
		{"tirar a tag", Patch{Tag: &TagEdit{}}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, _, err := applyPatch(Profile{}, "s1", c.patch)
			if c.ok && err != nil {
				t.Fatalf("erro inesperado: %v", err)
			}
			if !c.ok && !errors.Is(err, ErrInvalidProfile) {
				t.Fatalf("erro = %v, quer ErrInvalidProfile", err)
			}
		})
	}
}

func make6Traits() []Trait {
	out := []Trait{{Text: "a"}, {Text: "a"}, {Text: "a"}, {Text: "a"}, {Text: "a"}, {Text: "a"}}
	return out
}

func manyGames(n int) []Game {
	out := []Game{}
	for i := 0; i < n; i++ {
		out = append(out, Game{Name: strings.Repeat("g", i+1)})
	}
	return out
}

func TestApplyPatchLimpa(t *testing.T) {
	next, _, err := applyPatch(Profile{}, "s1", Patch{
		Traits:      ptr([]Trait{{Emoji: "🎮", Text: "  jogos  "}, {Emoji: "🎉", Text: "   "}, {}}),
		Description: ptr("  oi  "),
		Games:       ptr([]Game{{Name: " Dota 2 "}, {Name: "Dota 2"}}),
		Tag:         &TagEdit{Name: "AB1", Badge: "raio", Color: "#AABBCC"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Traits) != 1 || next.Traits[0].Text != "jogos" {
		t.Errorf("traços = %+v, quer só o preenchido e aparado", next.Traits)
	}
	if next.Description != "oi" {
		t.Errorf("descrição = %q", next.Description)
	}
	if len(next.Games) != 1 || next.Games[0].Name != "Dota 2" {
		t.Errorf("jogos = %+v, quer sem repetir", next.Games)
	}
	if next.Tag == nil || next.Tag.Color != "#aabbcc" || next.Tag.ServerID != "s1" {
		t.Errorf("tag = %+v", next.Tag)
	}
}

func TestApplyPatchSoMudaOQueVeio(t *testing.T) {
	base := Profile{Description: "fica", Private: true, Tag: &Tag{ServerID: "s1", Name: "ABC", Badge: "raio", Color: "#000000"}}
	next, _, err := applyPatch(base, "s1", Patch{Banner: &Art{Preset: "azul"}})
	if err != nil {
		t.Fatal(err)
	}
	if next.Description != "fica" || !next.Private || next.Tag.Name != "ABC" || next.Banner.Preset != "azul" {
		t.Errorf("perfil = %+v", next)
	}
}

// Trocar o NOME da tag obriga a reaplicar; emblema e cor, não.
func TestApplyPatchTagReset(t *testing.T) {
	base := Profile{Tag: &Tag{ServerID: "s1", Name: "ABC", Badge: "raio", Color: "#000000"}}
	cases := []struct {
		name      string
		edit      TagEdit
		wantReset bool
	}{
		{"só a cor", TagEdit{Name: "ABC", Badge: "raio", Color: "#ffffff"}, false},
		{"só o emblema", TagEdit{Name: "ABC", Badge: "lua", Color: "#000000"}, false},
		{"o nome", TagEdit{Name: "XYZ", Badge: "raio", Color: "#000000"}, true},
		{"só a caixa do nome", TagEdit{Name: "abc", Badge: "raio", Color: "#000000"}, true},
		{"tirou a tag", TagEdit{}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, change, err := applyPatch(base, "s1", Patch{Tag: &c.edit})
			if err != nil {
				t.Fatal(err)
			}
			if !change.TagChanged || change.TagReset != c.wantReset {
				t.Errorf("mudança = %+v, quer reset=%v", change, c.wantReset)
			}
		})
	}
	_, same, err := applyPatch(base, "s1", Patch{Tag: &TagEdit{Name: "ABC", Badge: "raio", Color: "#000000"}})
	if err != nil {
		t.Fatal(err)
	}
	if same.TagChanged {
		t.Error("tag igual não é mudança")
	}
	// Criar a primeira tag não reseta nada: ninguém a usava.
	_, first, err := applyPatch(Profile{}, "s1", Patch{Tag: &TagEdit{Name: "ABC", Badge: "raio", Color: "#000000"}})
	if err != nil {
		t.Fatal(err)
	}
	if !first.TagChanged || first.TagReset {
		t.Errorf("primeira tag = %+v", first)
	}
}
