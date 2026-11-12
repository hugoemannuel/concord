package channel

import "errors"

// Mensagens temporárias do canal (spec temporarias-servidor): o prazo vive em
// channels.disappearing_seconds; quem aplica a validade é o pacote message.

// ErrInvalidDisappearing: prazo fora da lista aceita.
var ErrInvalidDisappearing = errors.New("invalid disappearing interval")

// ValidChannelDisappearing diz se o prazo é 0 (desligar) ou 24 h, 7 dias ou 90 dias.
func ValidChannelDisappearing(seconds int) bool {
	switch seconds {
	case 0, 86400, 604800, 7776000:
		return true
	}
	return false
}
