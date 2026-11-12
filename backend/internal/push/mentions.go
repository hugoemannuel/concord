package push

import (
	"regexp"
	"strings"

	"gin-quickstart/backend/internal/message"
)

// O "@" precisa abrir o token (começo do texto, espaço ou pontuação de abertura): não vale em e-mail
// ("x@all.com") nem em link ("x.com/@nome"). Mesma regra de token do @nick do app (lib/mentions.ts).
var mentionPattern = regexp.MustCompile(`(?i)(?:^|[\s(\[{,;:!?"'])@([a-z0-9_]{3,32})\b`)

// Palavras que parecem usuário mas são menções em massa (tratadas por message.DetectEveryoneMention).
var reservedMentions = map[string]bool{"all": true, "here": true, "everyone": true}

// MentionedUsernames devolve os @usuários citados no texto, em minúsculas, sem repetir. Menção dentro
// de código não conta (message.StripCode), como no Discord.
func MentionedUsernames(content string) []string {
	var names []string
	seen := map[string]bool{}
	for _, m := range mentionPattern.FindAllStringSubmatch(message.StripCode(content), -1) {
		name := strings.ToLower(m[1])
		if reservedMentions[name] || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}

const previewRunes = 100

// ViewOncePreview é o rótulo da notificação (e da prévia da DM) de uma mídia de
// visualização única: o conteúdo nunca vai no corpo.
func ViewOncePreview(kind string) string {
	if kind == "video" {
		return "Vídeo de visualização única"
	}
	return "Foto de visualização única"
}

// Preview é o texto curto da notificação: aparado, no máximo 100 caracteres, e "Enviou um anexo" quando
// a mensagem só tem anexo, figurinha ou GIF.
func Preview(content string, hasMedia bool) string {
	text := strings.TrimSpace(content)
	if text == "" {
		if hasMedia {
			return "Enviou um anexo"
		}
		return ""
	}
	if r := []rune(text); len(r) > previewRunes {
		return string(r[:previewRunes]) + "…"
	}
	return text
}
