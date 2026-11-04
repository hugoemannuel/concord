package serverprofile

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Degradês da paleta do banner e da faixa (o desenho fica no app:
// features/serverprofile/lib/serverArt.ts). ” = o degradê padrão.
var artPresets = map[string]bool{
	"": true, "noite": true, "rosa": true, "vermelho": true, "laranja": true, "amarelo": true,
	"roxo": true, "azul": true, "turquesa": true, "verde": true, "cinza": true,
}

// Emblemas da tag (os SVG ficam em shared/ui/icons/serverTagBadges.tsx).
var tagBadges = map[string]bool{
	"folha": true, "espada": true, "coracao": true, "chama": true, "gota": true,
	"caveira": true, "lua": true, "raio": true, "cristal": true, "cogumelo": true,
	"estrela": true, "coroa": true, "escudo": true, "fantasma": true, "pata": true,
	"planeta": true, "foguete": true, "dado": true, "nota": true, "controle": true,
}

var (
	tagNamePattern  = regexp.MustCompile(`^[A-Za-z0-9]{1,4}$`)
	colorPattern    = regexp.MustCompile(`^#[0-9a-f]{6}$`)
	starterPattern  = regexp.MustCompile(`^[a-z0-9-]{0,32}$`)
	iconHashPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// maxSteamAppID: o appid da Steam é um inteiro de 32 bits (como no hub).
const maxSteamAppID = 1<<31 - 1

// Change diz o que a edição da tag obriga a avisar.
type Change struct {
	TagChanged bool
	// TagReset: o nome mudou (ou a tag saiu); os membros têm de reaplicar.
	TagReset bool
}

func invalid(what string) error { return fmt.Errorf("%w: %s", ErrInvalidProfile, what) }

// plainText: sem caracteres de controle e dentro do limite de letras.
func plainText(s string, max int) bool {
	return utf8.RuneCountInString(s) <= max && !strings.ContainsFunc(s, unicode.IsControl)
}

// validImage: só uma URL que nós mesmos geramos no envio (o UUID do arquivo).
func validImage(url string) bool {
	if url == "" {
		return true
	}
	id, ok := strings.CutPrefix(url, ImagePath)
	if !ok {
		return false
	}
	parsed, err := uuid.Parse(id)
	return err == nil && parsed.String() == id
}

func cleanArt(art Art) (Art, error) {
	if !artPresets[art.Preset] {
		return art, invalid("degradê desconhecido")
	}
	if !validImage(art.Image) {
		return art, invalid("imagem inválida")
	}
	return art, nil
}

func validEmoji(emoji string) bool {
	return plainText(emoji, MaxTraitEmoji) && !strings.ContainsFunc(emoji, func(r rune) bool {
		return r < utf8.RuneSelf
	})
}

// cleanTraits apara os textos e descarta os traços sem texto.
func cleanTraits(traits []Trait) ([]Trait, error) {
	if len(traits) > MaxTraits {
		return nil, invalid("traços demais")
	}
	out := []Trait{}
	for _, t := range traits {
		t.Text = strings.TrimSpace(t.Text)
		t.Emoji = strings.TrimSpace(t.Emoji)
		if !plainText(t.Text, MaxTraitText) || !validEmoji(t.Emoji) {
			return nil, invalid("traço inválido")
		}
		if t.Text != "" {
			out = append(out, t)
		}
	}
	return out, nil
}

func validGame(g Game) bool {
	if g.Name == "" || !plainText(g.Name, MaxGameName) {
		return false
	}
	if g.AppID < 0 || g.AppID > maxSteamAppID {
		return false
	}
	return g.IconHash == "" || iconHashPattern.MatchString(g.IconHash)
}

// cleanGames apara os nomes e tira os repetidos.
func cleanGames(games []Game) ([]Game, error) {
	if len(games) > MaxGames {
		return nil, invalid("jogos demais")
	}
	out := []Game{}
	seen := map[string]bool{}
	for _, g := range games {
		g.Name = strings.TrimSpace(g.Name)
		if !validGame(g) {
			return nil, invalid("jogo inválido")
		}
		if !seen[g.Name] {
			seen[g.Name] = true
			out = append(out, g)
		}
	}
	return out, nil
}

func cleanTheme(theme Theme) (Theme, error) {
	if !starterPattern.MatchString(theme.Starter) || !validImage(theme.Image) {
		return theme, invalid("fundo inválido")
	}
	if theme.Dim < 0 || theme.Dim > 100 {
		return theme, invalid("escurecimento inválido")
	}
	return theme, nil
}

func cleanDescription(text string) (string, error) {
	text = strings.TrimSpace(text)
	// A descrição pode ter quebra de linha; o resto dos controles, não.
	if !plainText(strings.ReplaceAll(text, "\n", " "), MaxDescription) {
		return "", invalid("descrição inválida")
	}
	return text, nil
}

// cleanTag: nil = sem tag. Só letras e números ASCII: acentos e parecidos de
// outros alfabetos abririam espaço para imitar a tag de outro servidor.
func cleanTag(serverID string, edit TagEdit) (*Tag, error) {
	if edit.Name == "" {
		return nil, nil
	}
	if !tagNamePattern.MatchString(edit.Name) {
		return nil, invalid("o nome da tag aceita até 4 letras e números")
	}
	color := strings.ToLower(edit.Color)
	if !tagBadges[edit.Badge] || !colorPattern.MatchString(color) {
		return nil, invalid("emblema ou cor da tag inválidos")
	}
	return &Tag{ServerID: serverID, Name: edit.Name, Badge: edit.Badge, Color: color}, nil
}

// tagChange compara a tag antes e depois.
func tagChange(before, after *Tag) Change {
	if before == nil && after == nil {
		return Change{}
	}
	if before == nil {
		return Change{TagChanged: true}
	}
	if after == nil || after.Name != before.Name {
		return Change{TagChanged: true, TagReset: true}
	}
	return Change{TagChanged: *before != *after}
}

// applyField limpa o valor pedido (nil = fica como está) e guarda.
func applyField[T any](dst *T, value *T, clean func(T) (T, error)) error {
	if value == nil {
		return nil
	}
	cleaned, err := clean(*value)
	if err != nil {
		return err
	}
	*dst = cleaned
	return nil
}

// applyPatch devolve o perfil com o que veio na edição, já validado e limpo.
func applyPatch(base Profile, serverID string, p Patch) (Profile, Change, error) {
	next := base
	err := firstError(
		applyField(&next.Banner, p.Banner, cleanArt),
		applyField(&next.Strip, p.Strip, cleanArt),
		applyField(&next.Traits, p.Traits, cleanTraits),
		applyField(&next.Games, p.Games, cleanGames),
		applyField(&next.Theme, p.Theme, cleanTheme),
		applyField(&next.Description, p.Description, cleanDescription),
	)
	if err != nil {
		return base, Change{}, err
	}
	if p.Private != nil {
		next.Private = *p.Private
	}
	if p.Tag == nil {
		return next, Change{}, nil
	}
	tag, err := cleanTag(serverID, *p.Tag)
	if err != nil {
		return base, Change{}, err
	}
	next.Tag = tag
	return next, tagChange(base.Tag, tag), nil
}

func firstError(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}
