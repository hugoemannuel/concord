package call

import (
	"encoding/json"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/user"
)

func TestUserInfoOfLevaOSomDeEntrada(t *testing.T) {
	sound := "/api/entrance-sounds/abc"
	info := userInfoOf(&user.User{ID: "u1", Username: "ana", DisplayName: "Ana", EntranceSoundURL: &sound})
	if info.ID != "u1" || info.DisplayName != "Ana" || info.EntranceSoundURL == nil || *info.EntranceSoundURL != sound {
		t.Fatalf("info = %+v", info)
	}
	data, _ := json.Marshal(StateEvent{CallID: "c1", User: info})
	if !strings.Contains(string(data), `"entrance_sound_url":"/api/entrance-sounds/abc"`) {
		t.Fatalf("call:joined sem o som de entrada: %s", data)
	}
}

func TestUserInfoOfSemSomDeEntradaOmiteOCampo(t *testing.T) {
	data, _ := json.Marshal(userInfoOf(&user.User{ID: "u1"}))
	if strings.Contains(string(data), "entrance_sound_url") {
		t.Fatalf("sem som de entrada o campo não vai: %s", data)
	}
}

func TestUserInfoOfLevaMolduraEFaixa(t *testing.T) {
	dec := "/api/profile-media/dec"
	plate := "/api/profile-media/plate"
	u := &user.User{
		ID:          "u1",
		DisplayName: "Ana",
	}
	u.Look.AvatarDecorationURL = &dec
	u.Look.NameplateURL = &plate
	info := userInfoOf(u)
	if info.AvatarDecorationURL == nil || *info.AvatarDecorationURL != dec {
		t.Fatalf("moldura não foi: %+v", info)
	}
	if info.NameplateURL == nil || *info.NameplateURL != plate {
		t.Fatalf("faixa não foi: %+v", info)
	}
	data, _ := json.Marshal(StateEvent{CallID: "c1", User: info})
	if !strings.Contains(string(data), `"avatar_decoration_url":"/api/profile-media/dec"`) {
		t.Fatalf("call:state sem a moldura: %s", data)
	}
}
