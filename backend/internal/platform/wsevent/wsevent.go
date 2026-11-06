// Package wsevent monta o envelope {"type", "payload"} dos eventos do
// WebSocket. Fica fora do platform/websocket para os domínios publicarem
// eventos sem importar o Hub.
package wsevent

import "encoding/json"

// Encode serializa o evento. O mapa (e não uma struct) mantém o formato que
// os apps já recebem: chaves em ordem alfabética.
func Encode(typ string, payload any) ([]byte, error) {
	return json.Marshal(map[string]any{"type": typ, "payload": payload})
}

// Marshal é o Encode para quem só publica: payload que não serializa vira nil.
func Marshal(typ string, payload any) []byte {
	data, err := Encode(typ, payload)
	if err != nil {
		return nil
	}
	return data
}
