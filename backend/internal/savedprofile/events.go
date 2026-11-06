package savedprofile

import "gin-quickstart/backend/internal/platform/wsevent"

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
	if userID == "" {
		return
	}
	n.SendToUser(userID, wsevent.Marshal(EventChanged, map[string]string{"user_id": userID}))
}
