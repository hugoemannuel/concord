package event

// Actions é o que alguém pode fazer com os eventos do servidor, como máscara de
// bits. O dono do servidor escolhe, cargo a cargo, quais ações cada um tem
// (configuração do servidor, vale para todos os eventos); ele mesmo pode todas.
// Configurar é o poder de abrir essa configuração e escolher criar, editar e
// excluir dos cargos; só o dono dá ou tira.
type Actions uint8

const (
	ActionCreate Actions = 1 << iota
	ActionEdit
	ActionDelete
	ActionConfigure

	// CrudActions: as ações sobre os eventos em si.
	CrudActions = ActionCreate | ActionEdit | ActionDelete
	AllActions  = CrudActions | ActionConfigure
)

// Has diz se todas as ações pedidas estão na máscara.
func (a Actions) Has(want Actions) bool { return a&want == want }

// actionsOf monta a máscara a partir dos três interruptores da tela.
func actionsOf(create, edit, remove, configure bool) Actions {
	var a Actions
	if configure {
		a |= ActionConfigure
	}
	if create {
		a |= ActionCreate
	}
	if edit {
		a |= ActionEdit
	}
	if remove {
		a |= ActionDelete
	}
	return a
}

// RoleAccess é um cargo e o que o dono deixou ele fazer com os eventos.
type RoleAccess struct {
	RoleID string `json:"role_id"`
	Name   string `json:"name"`
	Create bool   `json:"create"`
	Edit   bool   `json:"edit"`
	Delete bool   `json:"delete"`
	// Configure: o cargo também abre a configuração dos eventos (só o dono muda isto).
	Configure bool `json:"configure"`
}

// AccessView é o que a pessoa que pergunta pode fazer; o app esconde os botões
// do que ela não pode (o servidor confere de novo em cada pedido).
type AccessView struct {
	Create bool `json:"create"`
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
	// Configure: abre a configuração dos eventos (o dono sempre).
	Configure bool `json:"configure"`
	// Owner: é o dono do servidor (só ele vê a configuração por cargo).
	Owner bool `json:"owner"`
}
