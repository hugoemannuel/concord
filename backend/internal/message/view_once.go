package message

import "errors"

// ErrInvalidViewOnce: visualização única exige exatamente uma foto ou vídeo,
// sem figurinha nem GIF (o texto pode).
var ErrInvalidViewOnce = errors.New("invalid view once message")

func validateViewOnce(attachmentIDs []string, stickerID, gifURL *string) error {
	if len(attachmentIDs) != 1 || stickerID != nil || gifURL != nil {
		return ErrInvalidViewOnce
	}
	return nil
}

// ViewOnceMedia é o anexo de visualização única como a mensagem o expõe: sem
// URL, só o estado (igual para todos). O arquivo só se abre pelo token de
// POST /attachments/:id/open. RecipientIDs é quem podia abrir, fixado no envio
// (quem entrou no grupo depois não está ali e não vê o botão de abrir).
type ViewOnceMedia struct {
	ID             string   `json:"id"`
	Kind           string   `json:"kind"`
	Gone           bool     `json:"gone"`
	ViewerIDs      []string `json:"viewer_ids"`
	RecipientIDs   []string `json:"recipient_ids"`
	RecipientCount int      `json:"recipient_count"`
}
