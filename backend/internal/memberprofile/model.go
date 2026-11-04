// Package memberprofile é o perfil de uma pessoa dentro de um servidor (issue
// #529, ADR 0051): só os campos sobrescritos; o resto herda do perfil global.
// O nome não mora aqui: é o apelido do servidor, com as permissões dele.
package memberprofile

import (
	"encoding/json"

	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/profiletheme"
	"gin-quickstart/backend/internal/user"
)

// ErrNotMember: quem não é membro do servidor não tem perfil nele.
var ErrNotMember = permission.ErrNotMember

// Overrides são os campos sobrescritos (nil = herda). É o que os outros veem:
// vai em cada membro da lista e no evento server:member:update.
type Overrides struct {
	AvatarURL    *string             `json:"avatar_url,omitempty"`
	BannerURL    *string             `json:"banner_url,omitempty"`
	BannerColor  *string             `json:"banner_color,omitempty"`
	Pronouns     *string             `json:"pronouns,omitempty"`
	Bio          *string             `json:"bio,omitempty"`
	StatusText   *string             `json:"status_text,omitempty"`
	Links        *[]user.ProfileLink `json:"links,omitempty"`
	NameStyle    *namestyle.Style    `json:"name_style,omitempty"`
	ProfileTheme *profiletheme.Theme `json:"profile_theme,omitempty"`
	// NameplateMode: "off" esconde a faixa só neste servidor.
	NameplateMode *string `json:"nameplate_mode,omitempty"`
	// NameplateURL: a faixa efetiva quando ela depende do perfil do servidor
	// (calculada na leitura, não é coluna).
	NameplateURL        *string `json:"nameplate_url,omitempty"`
	AvatarDecorationURL *string `json:"avatar_decoration_url,omitempty"`
	// NameplateCustomURL: a imagem própria guardada. Como no perfil global, só a
	// própria pessoa vê (SelfOverrides).
	NameplateCustomURL *string `json:"-"`
}

// SelfOverrides é o perfil do servidor visto pela própria pessoa.
type SelfOverrides struct {
	Overrides
	NameplateCustomURL *string `json:"nameplate_custom_url,omitempty"`
}

// Empty: nada sobrescrito. Sem nenhum campo, o perfil do servidor não existe
// (a linha é apagada e a pessoa volta a ser só o perfil global).
func (o Overrides) Empty() bool {
	return o.AvatarURL == nil && o.BannerURL == nil && o.BannerColor == nil &&
		o.Pronouns == nil && o.Bio == nil && o.StatusText == nil && o.Links == nil &&
		o.NameStyle == nil && o.ProfileTheme == nil && o.NameplateMode == nil &&
		o.NameplateCustomURL == nil && o.AvatarDecorationURL == nil
}

// View é o que o editor de Configurações → Perfis precisa de um servidor.
type View struct {
	ServerID string        `json:"server_id"`
	UserID   string        `json:"user_id"`
	Profile  SelfOverrides `json:"profile"`
	// HasProfile: há algum campo sobrescrito (o apelido não conta).
	HasProfile bool `json:"has_profile"`
	// Nickname é o nome do perfil do servidor (nil = herda o nome de exibição).
	Nickname *string `json:"nickname"`
	// CanChangeNickname: CHANGE_NICKNAME só controla o nome; o resto do perfil é
	// de todo membro.
	CanChangeNickname bool `json:"can_change_nickname"`
}

// Field é um campo do PATCH com três estados: ausente (não mexe), null (volta
// ao padrão) e valor (sobrescreve).
type Field[T any] struct {
	Set   bool
	Value *T
}

// UnmarshalJSON só roda quando o campo veio no JSON (null incluso).
func (f *Field[T]) UnmarshalJSON(raw []byte) error {
	f.Set = true
	if string(raw) == "null" {
		f.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	f.Value = &v
	return nil
}

// Patch é a edição dos campos de texto, cor, listas, estilo e tema. A mídia tem
// rotas próprias (upload).
type Patch struct {
	BannerColor   Field[string]             `json:"banner_color"`
	Pronouns      Field[string]             `json:"pronouns"`
	Bio           Field[string]             `json:"bio"`
	StatusText    Field[string]             `json:"status_text"`
	Links         Field[[]user.ProfileLink] `json:"links"`
	NameStyle     Field[namestyle.Style]    `json:"name_style"`
	ProfileTheme  Field[profiletheme.Theme] `json:"profile_theme"`
	NameplateMode Field[string]             `json:"nameplate_mode"`
}

// MediaKind é cada imagem do perfil do servidor.
type MediaKind string

const (
	MediaAvatar     MediaKind = "avatar"
	MediaBanner     MediaKind = "banner"
	MediaNameplate  MediaKind = "nameplate"
	MediaDecoration MediaKind = "decoration"
)
