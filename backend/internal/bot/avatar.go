package bot

import (
	"embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Os avatares dos bots vão dentro do binário e saem por uma rota pública, como
// a mídia do perfil: o users.avatar_url deles (migration 000196) aponta para cá
// e os apps mostram como o avatar de qualquer pessoa.

//go:embed avatars/*
var avatarFiles embed.FS

const avatarPath = "/api/bot-media/"

// MaestroAvatarURL: GIF, por isso o "a_" (o app anima e pede o quadro parado em /static).
const MaestroAvatarURL = avatarPath + "a_maestro"

// SalinhaBotAvatarURL: a marca da Salinha sobre o degradê da marca.
const SalinhaBotAvatarURL = avatarPath + "salinha-bot"

type avatarFile struct {
	name, contentType string
}

// avatars: nome na URL -> arquivo animado (ou único) e o quadro parado.
var avatars = map[string][2]avatarFile{
	"a_maestro": {
		{"avatars/maestro.gif", "image/gif"},
		{"avatars/maestro-still.png", "image/png"},
	},
	"salinha-bot": {
		{"avatars/salinha-bot.png", "image/png"},
		{"avatars/salinha-bot.png", "image/png"},
	},
}

// AvatarRoutes: pública, para o <img> carregar sem token.
func AvatarRoutes(router *gin.RouterGroup) {
	router.GET("/bot-media/:name", func(c *gin.Context) { serveAvatar(c, 0) })
	router.GET("/bot-media/:name/static", func(c *gin.Context) { serveAvatar(c, 1) })
}

func serveAvatar(c *gin.Context, variant int) {
	files, ok := avatars[c.Param("name")]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}
	file := files[variant]
	data, err := avatarFiles.ReadFile(file.name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	// Sem "immutable": a imagem pode mudar numa versão nova com a mesma URL.
	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, file.contentType, data)
}
