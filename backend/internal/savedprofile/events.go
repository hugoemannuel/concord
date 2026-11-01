package savedprofile

import "encoding/json"

// EventChanged: a lista de perfis salvos da pessoa mudou (salvou, aplicou,
// renomeou, atualizou ou excluiu). Vai para a sala user:<id>; o app recarrega
// a lista, então não precisa de dados no aviso.
const EventChanged = "saved_profiles:changed"

// userNotifier entrega um evento a todos os aparelhos de uma pessoa
// (websocket.Hub.SendToUser).
type userNotifier interface {
	SendToUser(userID string, event []byte)
}

func notifyChanged(n userNotifier, userID string) {
	data, err := json.Marshal(map[string]any{
		"type":    EventChanged,
		"payload": map[string]string{"user_id": userID},
	})
	if err != nil || userID == "" {
		return
	}
	n.SendToUser(userID, data)
}
