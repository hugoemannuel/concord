package cosmetics

import (
	"strings"
	"testing"
)

func TestValidMode(t *testing.T) {
	for _, m := range []string{"off", "banner", "custom"} {
		if !ValidMode(m) {
			t.Errorf("ValidMode(%q) = false, quer true", m)
		}
	}
	for _, m := range []string{"", "OFF", "x"} {
		if ValidMode(m) {
			t.Errorf("ValidMode(%q) = true, quer false", m)
		}
	}
}

func TestExprUsesAlias(t *testing.T) {
	e := Expr("u")
	for _, want := range []string{"u.nameplate_mode", "u.banner_url", "u.nameplate_url", "u.avatar_decoration_url"} {
		if !strings.Contains(e, want) {
			t.Errorf("Expr(\"u\") sem %q: %s", want, e)
		}
	}
}

func TestResolve(t *testing.T) {
	b, n, d := "b", "n", "d"
	if got := Resolve("off", &b, &n, &d); got.NameplateURL != nil || got.AvatarDecorationURL != &d {
		t.Errorf("off: %+v", got)
	}
	if got := Resolve("banner", &b, &n, nil); got.NameplateURL != &b {
		t.Errorf("banner: %+v", got)
	}
	if got := Resolve("banner", nil, &n, nil); got.NameplateURL != nil {
		t.Errorf("banner sem banner: %+v", got)
	}
	if got := Resolve("custom", &b, &n, nil); got.NameplateURL != &n {
		t.Errorf("custom: %+v", got)
	}
}
