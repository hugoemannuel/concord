package message

// ViewOnceMedia é o anexo de visualização única como a mensagem o expõe: sem
// URL, só o estado (igual para todos). O arquivo só se abre pelo token de
// POST /attachments/:id/open.
type ViewOnceMedia struct {
	ID             string   `json:"id"`
	Kind           string   `json:"kind"`
	Gone           bool     `json:"gone"`
	ViewerIDs      []string `json:"viewer_ids"`
	RecipientCount int      `json:"recipient_count"`
}
