package user

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/profiletheme"
)

// Limites do perfil (os mesmos do Discord; o app usa os mesmos números).
const (
	MaxDisplayName = 32
	MaxPronouns    = 40
	MaxBio         = 190
	MaxStatusText  = 128
	MaxLinks       = 5
	MaxLinkLength  = 256
)

var ErrInvalidProfile = errors.New("perfil inválido")

var bannerColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// ProfileInput é o que a pessoa edita no "Perfis" das configurações.
type ProfileInput struct {
	DisplayName string        `json:"display_name"`
	Pronouns    string        `json:"pronouns"`
	Bio         string        `json:"bio"`
	StatusText  string        `json:"status_text"`
	BannerColor *string       `json:"banner_color"`
	Links       []ProfileLink `json:"links"`
	// NameStyle nil = não mexe (cliente antigo não manda o campo).
	NameStyle *namestyle.Style `json:"name_style"`
	// ProfileTheme nil = não mexe (cliente antigo não manda o campo).
	ProfileTheme *profiletheme.Theme `json:"profile_theme"`
}

func invalid(msg string) error {
	return fmt.Errorf("%w: %s", ErrInvalidProfile, msg)
}

// InvalidProfile é o mesmo erro para quem valida perfil fora daqui.
func InvalidProfile(msg string) error { return invalid(msg) }

// ValidateProfile confere os limites e devolve o perfil arrumado (sem espaços
// nas pontas, cor em minúsculas, links nunca nil). Tamanhos contam caracteres,
// não bytes: "ç" e emoji contam como um.
func ValidateProfile(in ProfileInput) (ProfileInput, error) {
	out := ProfileInput{
		DisplayName: strings.TrimSpace(in.DisplayName),
		Pronouns:    strings.TrimSpace(in.Pronouns),
		Bio:         strings.TrimSpace(in.Bio),
		StatusText:  strings.TrimSpace(in.StatusText),
	}

	if _, err := NormalizeName(out.DisplayName, MaxDisplayName); err != nil {
		if errors.Is(err, ErrNameInvalidChars) || errors.Is(err, ErrNameBlank) {
			return ProfileInput{}, invalid("o nome de exibição não pode ter caracteres invisíveis ou de controle")
		}
		return ProfileInput{}, invalid(fmt.Sprintf("o nome de exibição precisa ter de 1 a %d caracteres", MaxDisplayName))
	}
	if err := ValidateTextFields(out.Pronouns, out.Bio, out.StatusText); err != nil {
		return ProfileInput{}, err
	}

	if in.BannerColor != nil && *in.BannerColor != "" {
		color, err := NormalizeBannerColor(*in.BannerColor)
		if err != nil {
			return ProfileInput{}, err
		}
		out.BannerColor = &color
	}

	links, err := NormalizeLinks(in.Links)
	if err != nil {
		return ProfileInput{}, err
	}
	out.Links = links

	if in.NameStyle != nil {
		style, err := namestyle.Validate(*in.NameStyle)
		if err != nil {
			return ProfileInput{}, invalid(err.Error())
		}
		out.NameStyle = &style
	}

	if in.ProfileTheme != nil {
		theme, err := profiletheme.Validate(*in.ProfileTheme)
		if err != nil {
			return ProfileInput{}, invalid(err.Error())
		}
		out.ProfileTheme = &theme
	}

	return out, nil
}

// ValidateTextFields confere o tamanho de pronomes, "Sobre mim" e nota (já sem
// espaços nas pontas). Vale para o perfil global e para o perfil do servidor.
func ValidateTextFields(pronouns, bio, statusText string) error {
	if utf8.RuneCountInString(pronouns) > MaxPronouns {
		return invalid(fmt.Sprintf("os pronomes podem ter até %d caracteres", MaxPronouns))
	}
	if utf8.RuneCountInString(bio) > MaxBio {
		return invalid(fmt.Sprintf("o \"Sobre mim\" pode ter até %d caracteres", MaxBio))
	}
	if utf8.RuneCountInString(statusText) > MaxStatusText {
		return invalid(fmt.Sprintf("a nota pode ter até %d caracteres", MaxStatusText))
	}
	return nil
}

// NormalizeBannerColor confere a cor (#rrggbb) e devolve em minúsculas.
func NormalizeBannerColor(color string) (string, error) {
	if !bannerColorPattern.MatchString(color) {
		return "", invalid("cor do banner inválida")
	}
	return strings.ToLower(color), nil
}

// NormalizeLinks confere limite, formato e repetição; nunca devolve nil.
func NormalizeLinks(links []ProfileLink) ([]ProfileLink, error) {
	if len(links) > MaxLinks {
		return nil, invalid(fmt.Sprintf("o perfil pode ter até %d links", MaxLinks))
	}
	out := []ProfileLink{}
	seen := map[string]bool{}
	for _, link := range links {
		raw := strings.TrimSpace(link.URL)
		if !validLink(raw) {
			return nil, invalid(fmt.Sprintf("link inválido: %q", raw))
		}
		key := strings.ToLower(raw)
		if seen[key] {
			return nil, invalid(fmt.Sprintf("link repetido: %q", raw))
		}
		seen[key] = true
		out = append(out, ProfileLink{URL: raw})
	}
	return out, nil
}

// validLink aceita só http(s) com host: barra javascript:, data:, file: etc.
func validLink(raw string) bool {
	if raw == "" || len(raw) > MaxLinkLength {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != ""
}

// Status que a pessoa escolhe. "offline" não é escolha: é o que os outros
// veem quando ela está desconectada ou invisível.
const (
	StatusOnline    = "online"
	StatusIdle      = "idle"
	StatusDND       = "dnd"
	StatusInvisible = "invisible"
	StatusOffline   = "offline"
)

var ErrInvalidStatus = errors.New("status inválido")

func ValidStatus(status string) bool {
	switch status {
	case StatusOnline, StatusIdle, StatusDND, StatusInvisible:
		return true
	}
	return false
}

// EffectiveStatus é o status que os outros veem.
func EffectiveStatus(chosen string, connected bool) string {
	if !connected || chosen == StatusInvisible {
		return StatusOffline
	}
	if !ValidStatus(chosen) {
		return StatusOnline
	}
	return chosen
}
