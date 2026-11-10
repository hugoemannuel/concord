package channel

import "errors"

// Modo lento (issue #586): intervalo mínimo, em segundos, entre as mensagens de
// cada membro no canal. Quem aplica é o pacote message.

// ErrInvalidSlowmode: intervalo fora da lista aceita.
var ErrInvalidSlowmode = errors.New("invalid slowmode interval")

// slowmodeChoices: os intervalos que o app oferece (os do Discord); 0 = desligado.
var slowmodeChoices = map[int]bool{
	0: true, 5: true, 10: true, 15: true, 30: true,
	60: true, 120: true, 300: true, 600: true, 900: true, 1800: true,
	3600: true, 7200: true, 21600: true,
}

// ValidSlowmode diz se o intervalo é um dos aceitos.
func ValidSlowmode(seconds int) bool {
	return slowmodeChoices[seconds]
}

// UpdateInput: o que a edição do canal muda. SlowmodeSeconds nil = não mexe.
type UpdateInput struct {
	Name            string
	SlowmodeSeconds *int
}

// validate confere o pedido de edição.
func (in UpdateInput) validate() error {
	if in.Name == "" {
		return ErrNameRequired
	}
	if in.SlowmodeSeconds != nil && !ValidSlowmode(*in.SlowmodeSeconds) {
		return ErrInvalidSlowmode
	}
	return nil
}
