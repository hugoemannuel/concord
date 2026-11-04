package memberprofile

import (
	"fmt"

	"gin-quickstart/backend/internal/namestyle"
)

// Pedaços de SQL para quem lista pessoas (membros, mensagens) juntar o perfil
// do servidor na mesma consulta, sem N+1. `smp` é o alias de
// server_member_profiles (LEFT JOIN) e `u` o de users: sem perfil do servidor,
// todo COALESCE cai no global e a resposta fica igual à de antes.

// AvatarExpr é o avatar efetivo.
func AvatarExpr(smp, u string) string {
	return fmt.Sprintf(`COALESCE(%s.avatar_url, %s.avatar_url)`, smp, u)
}

// NameStyleExpr é o estilo do nome efetivo em JSON.
func NameStyleExpr(smp, u string) string {
	return fmt.Sprintf(`COALESCE(%s.name_style, %s)`, smp, namestyle.Expr(u))
}

// DecorationExpr é a moldura efetiva.
func DecorationExpr(smp, u string) string {
	return fmt.Sprintf(`COALESCE(%s.avatar_decoration_url, %s.avatar_decoration_url)`, smp, u)
}

// nameplateExpr é a faixa efetiva: o modo sobrescrito ou o global, com o banner
// e a imagem própria do servidor antes dos globais.
func nameplateExpr(smp, u string) string {
	return fmt.Sprintf(
		`CASE COALESCE(%[1]s.nameplate_mode, %[2]s.nameplate_mode) WHEN 'banner' THEN COALESCE(%[1]s.banner_url, %[2]s.banner_url) WHEN 'custom' THEN COALESCE(%[1]s.nameplate_url, %[2]s.nameplate_url) END`,
		smp, u,
	)
}

// LookExpr monta o cosmetics.Look efetivo em JSON.
func LookExpr(smp, u string) string {
	return fmt.Sprintf(`jsonb_build_object('nameplate_url', %s, 'avatar_decoration_url', %s)`, nameplateExpr(smp, u), DecorationExpr(smp, u))
}

// overrideNameplateExpr é a faixa efetiva só quando ela depende do perfil do
// servidor; NULL = herda a faixa global (que chega ao vivo por user:update).
func overrideNameplateExpr(smp, u string) string {
	return fmt.Sprintf(
		`CASE WHEN %[1]s.nameplate_mode IS NOT NULL OR %[1]s.nameplate_url IS NOT NULL OR (%[1]s.banner_url IS NOT NULL AND %[2]s.nameplate_mode = 'banner') THEN %[3]s END`,
		smp, u, nameplateExpr(smp, u),
	)
}

// OverridesExpr monta os campos sobrescritos em JSON (NULL = sem perfil);
// escaneia direto num *Overrides.
func OverridesExpr(smp, u string) string {
	return fmt.Sprintf(`CASE WHEN %[1]s.user_id IS NOT NULL THEN jsonb_build_object(
				'avatar_url', %[1]s.avatar_url,
				'banner_url', %[1]s.banner_url,
				'banner_color', %[1]s.banner_color,
				'pronouns', %[1]s.pronouns,
				'bio', %[1]s.bio,
				'status_text', %[1]s.status_text,
				'links', %[1]s.links,
				'name_style', %[1]s.name_style,
				'profile_theme', %[1]s.profile_theme,
				'nameplate_mode', %[1]s.nameplate_mode,
				'nameplate_url', %[2]s,
				'avatar_decoration_url', %[1]s.avatar_decoration_url
			) END`, smp, overrideNameplateExpr(smp, u))
}
