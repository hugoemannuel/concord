package proposal

import "github.com/gin-gonic/gin"

// ProposalRoutes: criar, editar, comentar e enviar imagem exigem e-mail
// confirmado (requireVerified); ler e votar não. As imagens são servidas sem
// token (veja Handler.ServeImage).
func ProposalRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware, requireVerified gin.HandlerFunc) {
	router.GET("/proposal-media/:id", handler.ServeImage)

	router.POST("/proposal-media", authMiddleware, requireVerified, handler.UploadImage)

	// Anexos dos comentários (imagem, vídeo e áudio): enviados por quem está
	// logado e servidos sem token, como as imagens das propostas.
	router.GET("/proposal-comment-media/:id", handler.ServeCommentMedia)
	router.POST("/proposal-comment-media", authMiddleware, requireVerified, handler.UploadCommentMedia)

	proposals := router.Group("/proposals")
	proposals.Use(authMiddleware)
	{
		proposals.GET("", handler.List)
		proposals.GET("/", handler.List)
		proposals.POST("", requireVerified, handler.Create)
		proposals.GET("/archived", handler.Archived)
		proposals.POST("/archive-all", handler.ArchiveAll)
		proposals.PUT("/:id/archive", handler.Archive)
		proposals.DELETE("/:id/archive", handler.Unarchive)
		proposals.GET("/mentions", handler.Mentions)
		proposals.POST("/mentions/seen", handler.MarkMentionsSeen)
		proposals.PUT("/github-username", handler.SetGithubUsername)
		proposals.PATCH("/:id", requireVerified, handler.Update)
		proposals.PUT("/:id/vote", requireVerified, handler.Vote)
		proposals.DELETE("/:id/vote", handler.RemoveVote)
		proposals.PATCH("/:id/status", handler.SetStatus)
		proposals.DELETE("/:id", handler.Delete)
		proposals.GET("/:id/comments", handler.Comments)
		proposals.POST("/:id/comments", requireVerified, handler.AddComment)
		proposals.PATCH("/:id/comments/:commentId", requireVerified, handler.EditComment)
		proposals.DELETE("/:id/comments/:commentId", handler.DeleteComment)
		proposals.POST("/:id/comments/:commentId/reactions", requireVerified, handler.React)
		proposals.DELETE("/:id/comments/:commentId/reactions", handler.Unreact)
	}
}
