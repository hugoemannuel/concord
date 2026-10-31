// Package cosmetics é a faixa (imagem atrás do nome nas listas) e a moldura do
// avatar (#482). Os modos daqui têm de ser os mesmos do app (frontend
// lib/cosmetics.ts; um teste de lá confere a lista).
package cosmetics

import (
	"errors"
	"fmt"
	"slices"
)

var ErrInvalid = errors.New("faixa inválida")

// Modes: "off" (sem faixa), "banner" (usa o banner) e "custom" (a imagem
// enviada para a faixa).
var Modes = []string{"off", "banner", "custom"}

const (
	ModeOff    = "off"
	ModeBanner = "banner"
	ModeCustom = "custom"
)

func ValidMode(m string) bool { return slices.Contains(Modes, m) }

// Look é o que os outros veem: a URL efetiva da faixa e a moldura. Embutido
// nos structs de usuário, sai achatado no JSON (ausente = não tem).
type Look struct {
	NameplateURL        *string `json:"nameplate_url,omitempty"`
	AvatarDecorationURL *string `json:"avatar_decoration_url,omitempty"`
}

// NameplateExpr é a URL efetiva da faixa de quem está em `alias` (a tabela
// users): o banner, a imagem própria ou NULL.
func NameplateExpr(alias string) string {
	return fmt.Sprintf(
		`CASE %[1]s.nameplate_mode WHEN 'banner' THEN %[1]s.banner_url WHEN 'custom' THEN %[1]s.nameplate_url END`,
		alias,
	)
}

// Expr monta o Look de `alias` em JSON; escaneia direto num Look.
func Expr(alias string) string {
	return fmt.Sprintf(
		`jsonb_build_object('nameplate_url', %s, 'avatar_decoration_url', %s.avatar_decoration_url)`,
		NameplateExpr(alias), alias,
	)
}

// Resolve é a mesma regra do NameplateExpr, para quem já tem as colunas em Go.
func Resolve(mode string, bannerURL, customURL, decorationURL *string) Look {
	look := Look{AvatarDecorationURL: decorationURL}
	switch mode {
	case ModeBanner:
		look.NameplateURL = bannerURL
	case ModeCustom:
		look.NameplateURL = customURL
	}
	return look
}

// ModeAfterSet é o modo depois de gravar (url) ou apagar (nil) a imagem
// própria da faixa: enviar liga a imagem própria; apagar a que estava em uso
// desliga a faixa; apagar no modo banner não muda nada.
func ModeAfterSet(current string, url *string) string {
	if url != nil {
		return ModeCustom
	}
	if current == ModeCustom {
		return ModeOff
	}
	return current
}
