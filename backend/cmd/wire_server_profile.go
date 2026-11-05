package main

import (
	"context"
	"errors"
	"path/filepath"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/serverprofile"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireServerProfile: a customização do servidor (ADR 0050). As imagens ficam
// numa pasta própria de UPLOADS_DIR, com o mesmo upload do avatar.
func (a *app) wireServerProfile() {
	repo := serverprofile.NewRepository(a.db)
	service := serverprofile.NewService(repo, a.hub, a.hub.PresenceMap)
	service.SetAudit(a.audit)
	service.SetInviteResolver(a.resolveInviteCode)
	tags := serverprofile.NewTags(repo, a.hub)
	// A tag sai no banco (chave para server_members); aqui só avisa quem a tem guardada.
	a.moderationService.OnRemoved(tags.MemberLeft)

	dir := filepath.Join(a.uploadsDir, serverprofile.ImageDir)
	files := mustStore(dir, "server profile images dir")
	media := user.NewProfileHandler(nil, files, mustStore(filepath.Join(dir, "static"), "server profile images dir"), a.uploadSpace)
	go serverprofile.NewImageJanitor(files, repo).Run(a.ctx)
	go serverprofile.NewGameSampler(a.hub.PlayingGames, repo).Run(a.ctx)

	handler := serverprofile.NewHandler(service, a.permissionService, repo)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		serverprofile.Routes(api, handler, serverprofile.NewTagHandler(tags), serverprofile.NewImageHandler(handler, media), a.authMiddleware, auth.OptionalAuthMiddleware(a.authService))
	})
}

// resolveInviteCode: o servidor de um código, pela mesma leitura da prévia do
// convite (normaliza o que a pessoa digitou e guarda por 45 s).
func (a *app) resolveInviteCode(ctx context.Context, code string) (string, error) {
	preview, err := a.serverService.InvitePreview(ctx, code)
	if errors.Is(err, server.ErrInvalidCode) {
		return "", serverprofile.ErrInvalidInvite
	}
	if err != nil {
		return "", err
	}
	return preview.ServerID, nil
}
