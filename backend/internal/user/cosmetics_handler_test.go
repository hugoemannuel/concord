package user

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// selfView: o que a própria pessoa recebe sobre a faixa e a moldura.
type selfView struct {
	NameplateMode       string  `json:"nameplate_mode"`
	NameplateURL        *string `json:"nameplate_url"`
	NameplateCustomURL  *string `json:"nameplate_custom_url"`
	AvatarDecorationURL *string `json:"avatar_decoration_url"`
	BannerURL           *string `json:"banner_url"`
}

func decodeSelf(t *testing.T, rec *httptest.ResponseRecorder) selfView {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var v selfView
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("resposta inválida: %s", rec.Body.String())
	}
	return v
}

func val(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func (e *profileEnv) setMode(t *testing.T, mode string) *httptest.ResponseRecorder {
	t.Helper()
	return e.do(t, http.MethodPut, "/api/users/me/nameplate-mode", []byte(`{"mode":"`+mode+`"}`), "application/json")
}

func TestUploadNameplateTurnsCustomOn(t *testing.T) {
	env := newProfileEnv(t)
	v := decodeSelf(t, env.upload(t, "/api/users/me/nameplate", map[string][]byte{"file": pngData()}))
	if v.NameplateMode != "custom" {
		t.Errorf("modo = %q, quer custom", v.NameplateMode)
	}
	if v.NameplateURL == nil || val(v.NameplateURL) != val(v.NameplateCustomURL) {
		t.Errorf("nameplate_url = %s, custom = %s", val(v.NameplateURL), val(v.NameplateCustomURL))
	}
	last := env.events.published[len(env.events.published)-1]
	if val(last.NameplateURL) != val(v.NameplateURL) {
		t.Errorf("user:update com faixa %s, quer %s", val(last.NameplateURL), val(v.NameplateURL))
	}
}

func TestDeleteCustomNameplateTurnsOff(t *testing.T) {
	env := newProfileEnv(t)
	decodeSelf(t, env.upload(t, "/api/users/me/nameplate", map[string][]byte{"file": pngData()}))
	v := decodeSelf(t, env.do(t, http.MethodDelete, "/api/users/me/nameplate", nil, ""))
	if v.NameplateMode != "off" || v.NameplateURL != nil || v.NameplateCustomURL != nil {
		t.Errorf("depois de apagar: %+v", v)
	}
	if n := env.fileCount(t, env.store); n != 0 {
		t.Errorf("%d arquivos sobraram", n)
	}
}

func TestBannerModeUsesBannerAndKeepsCustom(t *testing.T) {
	env := newProfileEnv(t)
	decodeSelf(t, env.upload(t, "/api/users/me/banner", map[string][]byte{"file": pngData()}))
	custom := decodeSelf(t, env.upload(t, "/api/users/me/nameplate", map[string][]byte{"file": pngData()})).NameplateCustomURL
	v := decodeSelf(t, env.setMode(t, "banner"))
	if v.NameplateMode != "banner" || val(v.NameplateURL) != val(v.BannerURL) {
		t.Errorf("modo banner: %+v (banner %s)", v, val(v.BannerURL))
	}
	if val(v.NameplateCustomURL) != val(custom) {
		t.Errorf("imagem própria perdida: %s, quer %s", val(v.NameplateCustomURL), val(custom))
	}
	after := decodeSelf(t, env.do(t, http.MethodDelete, "/api/users/me/nameplate", nil, ""))
	if after.NameplateMode != "banner" || val(after.NameplateURL) != val(after.BannerURL) {
		t.Errorf("apagar a imagem própria no modo banner: %+v", after)
	}
}

func TestNameplateModeRejectsInvalid(t *testing.T) {
	env := newProfileEnv(t)
	if rec := env.setMode(t, "custom"); rec.Code != http.StatusBadRequest {
		t.Errorf("custom sem imagem: status %d", rec.Code)
	}
	if rec := env.setMode(t, "x"); rec.Code != http.StatusBadRequest {
		t.Errorf("modo x: status %d", rec.Code)
	}
	if rec := env.setMode(t, "banner"); rec.Code != http.StatusOK {
		t.Errorf("banner sem banner deveria valer: status %d", rec.Code)
	}
}

func TestUploadDecorationGIF(t *testing.T) {
	env := newProfileEnv(t)
	v := decodeSelf(t, env.upload(t, "/api/users/me/decoration", map[string][]byte{"file": gifData(), "static": pngData()}))
	if !strings.HasPrefix(val(v.AvatarDecorationURL), "/api/profile-media/a_") {
		t.Errorf("moldura = %s", val(v.AvatarDecorationURL))
	}
	last := env.events.published[len(env.events.published)-1]
	if val(last.AvatarDecorationURL) != val(v.AvatarDecorationURL) {
		t.Errorf("user:update sem a moldura")
	}
	off := decodeSelf(t, env.do(t, http.MethodDelete, "/api/users/me/decoration", nil, ""))
	if off.AvatarDecorationURL != nil {
		t.Errorf("moldura não saiu: %s", val(off.AvatarDecorationURL))
	}
}

func TestReplaceNameplateRemovesOldFile(t *testing.T) {
	env := newProfileEnv(t)
	decodeSelf(t, env.upload(t, "/api/users/me/nameplate", map[string][]byte{"file": pngData()}))
	decodeSelf(t, env.upload(t, "/api/users/me/nameplate", map[string][]byte{"file": pngData()}))
	if n := env.fileCount(t, env.store); n != 1 {
		t.Errorf("%d arquivos, quer 1", n)
	}
}
