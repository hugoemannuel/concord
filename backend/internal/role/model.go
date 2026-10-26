// Package role cuida dos cargos de cada servidor: criar, editar, apagar,
// reordenar e dar/tirar cargo de membro, sempre respeitando a hierarquia.
package role

import (
	"errors"

	"gin-quickstart/backend/internal/permission"
)

type Role = permission.Role

// MaxRoles por servidor, fora o @everyone.
const MaxRoles = 50

const maxNameLength = 32

var (
	ErrRoleNotFound    = errors.New("cargo não encontrado")
	ErrEveryoneRole    = errors.New("o @everyone não pode ser apagado, renomeado nem movido")
	ErrBotRole         = errors.New("o cargo Bots é fixo do servidor e não pode ser apagado, movido nem atribuído a outros usuários")
	ErrRoleHierarchy   = errors.New("você só mexe em cargos abaixo do seu cargo mais alto")
	ErrCannotGrant     = errors.New("você não pode dar uma permissão que não tem")
	ErrTooManyRoles    = errors.New("limite de cargos do servidor atingido")
	ErrInvalidName     = errors.New("o nome do cargo precisa ter de 1 a 32 caracteres")
	ErrInvalidColor    = errors.New("cor inválida")
	ErrInvalidOrder    = errors.New("a ordem precisa ter exatamente os cargos do servidor")
	ErrMemberNotFound  = errors.New("membro não encontrado")
	ErrNoModeratorRole = errors.New("o servidor não tem mais o cargo Moderador")
)

// Input são os campos editáveis; nil = não mexe. ClearColor tira a cor.
type Input struct {
	Name        *string `json:"name"`
	Color       *int    `json:"color"`
	ClearColor  bool    `json:"clear_color"`
	Hoist       *bool   `json:"hoist"`
	Permissions *int64  `json:"permissions"`
}

type RoleEvent struct {
	ServerID string `json:"server_id"`
	Role     Role   `json:"role"`
}

type DeleteEvent struct {
	ServerID string `json:"server_id"`
	RoleID   string `json:"role_id"`
}

// ReorderEvent leva todos os cargos com as posições novas.
type ReorderEvent struct {
	ServerID string `json:"server_id"`
	Roles    []Role `json:"roles"`
}

type MemberRolesEvent struct {
	ServerID string   `json:"server_id"`
	UserID   string   `json:"user_id"`
	RoleIDs  []string `json:"role_ids"`
}
